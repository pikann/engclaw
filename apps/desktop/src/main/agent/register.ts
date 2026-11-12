import { MANDARIN_SYSTEM_PROMPT, SYSTEM_PROMPT } from './persona'
import type { ChineseDictionary } from '../chinese-dictionary'
import { BrowserWindow, net } from 'electron'
import type Database from 'better-sqlite3'
import { getWord, searchWords } from '@engclaw/dictionary'
import { IPC, type AgentEvent } from '@engclaw/ipc-contract'
import { handle } from '../ipc'
import type { LlmConfigStore } from '../llm/config-store'
import type { Store } from '../store'
import { AgentService } from './service'
import { lookupDictionaryTool, practiceHistoryTool, type DictionarySource } from './info-tools'

const dictionarySource = (open: () => Database.Database): DictionarySource => ({
  lookup(word) {
    const db = open()
    const hit = searchWords(db, word, 1)[0]
    if (!hit || hit.match !== 'prefix' || hit.word.toLowerCase() !== word.trim().toLowerCase())
      return null
    const entry = getWord(db, hit.id)
    return (
      entry && {
        word: entry.word,
        ipa: entry.pronunciations,
        senses: entry.senses,
        morphemes: entry.morphemes.map((m) => ({
          kind: m.kind,
          form: m.form,
          meaning: m.root.meaning,
        })),
      }
    )
  },
})

export function registerAgentHandlers(
  llm: LlmConfigStore,
  store: Store,
  openDictionary: () => Database.Database,
  chinese: ChineseDictionary,
): AgentService {
  const emit = (e: AgentEvent): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.agentEvent, e)
  }
  const source = dictionarySource(openDictionary)
  const service = new AgentService({
    systemPrompt: () =>
      store.settings.get().learningLanguage === 'zh' ? MANDARIN_SYSTEM_PROMPT : SYSTEM_PROMPT,
    store: store.agent,
    config: () => llm.load(),
    fetchFn: (url, init) => net.fetch(url, init),
    emit,
    tools: {
      lookup_dictionary: lookupDictionaryTool({
        lookup(word) {
          if (store.settings.get().learningLanguage !== 'zh') return source.lookup(word)
          const hit = chinese.search(word, 1)[0]
          const entry = hit && chinese.word(hit.id)
          return entry
            ? { word: entry.word, ipa: [entry.pinyin ?? ''], senses: entry.senses, morphemes: [] }
            : null
        },
      }),
      get_practice_history: practiceHistoryTool({
        recent: (n) => store.history.list(n, 0, undefined, store.settings.get().learningLanguage),
      }),
    },
  })
  handle(IPC.agentSend, (req) => service.send(req))
  handle(IPC.agentCancel, ({ requestId }) => {
    service.cancel(requestId)
    return null
  })
  handle(IPC.agentMessages, ({ conversationId }) => service.messages(conversationId))
  handle(IPC.agentList, () => service.conversations())
  return service
}
