import { CHINESE_ID_BASE, type ChineseDictionary } from './chinese-dictionary'
import { app, net } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { getRoot, getWord, listRootOrigins, listRoots, searchWords } from '@engclaw/dictionary'
import { IPC } from '@engclaw/ipc-contract'
import { handle } from './ipc'
import type { Store } from './store'
import { WordImageService } from './word-image'

const dictionaryPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'dictionary.sqlite')
    : join(app.getAppPath(), 'resources', 'data', 'dictionary.sqlite')

/** Registers the read-only dictionary channels; returns the lazy database opener for other features. */
export function registerDictionaryHandlers(
  store: Store,
  chinese: ChineseDictionary,
): () => Database.Database {
  const target = () => store.settings.get().learningLanguage
  let db: Database.Database | undefined
  const open = (): Database.Database =>
    (db ??= new Database(dictionaryPath(), { readonly: true, fileMustExist: true }))

  handle(IPC.dictionarySearch, ({ query, limit, language }) =>
    (language ?? target()) === 'zh'
      ? chinese.search(query, limit)
      : searchWords(open(), query, limit),
  )
  handle(IPC.dictionaryWord, ({ id, language }) =>
    (language ?? target()) === 'zh'
      ? chinese.word(id)
      : id < CHINESE_ID_BASE
        ? getWord(open(), id)
        : null,
  )
  handle(IPC.dictionaryRoot, ({ id }) => (target() === 'zh' ? null : getRoot(open(), id)))
  handle(IPC.dictionaryRoots, (req) => ({
    roots: target() === 'zh' ? [] : listRoots(open(), req ?? {}),
    origins: target() === 'zh' ? [] : listRootOrigins(open()),
  }))
  const images = new WordImageService({
    store: store.wordImages,
    fetch: (url, init) => net.fetch(String(url), init as Parameters<typeof net.fetch>[1]),
    enabled: () => store.settings.get().wordImages,
    userAgent: `Engclaw/${app.getVersion()} (https://github.com/pikann/engclaw; word illustrations)`,
  })
  handle(IPC.dictionaryImage, async ({ id }) => {
    if (id >= CHINESE_ID_BASE || target() === 'zh') return null
    const entry = getWord(open(), id)
    if (!entry) return null
    return images.get(
      entry.word,
      entry.senses.some((s) => s.pos === 'n'),
    )
  })
  app.on('will-quit', () => db?.close())
  return open
}
