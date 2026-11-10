import { app, BrowserWindow, dialog } from 'electron'
import type Database from 'better-sqlite3'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { findWordId, getWord, rootFamilyWords, rootMastery } from '@engclaw/dictionary'
import { IPC, type LearningFileResult, type TextFileResult } from '@engclaw/ipc-contract'
import { buildQuiz } from './deck-quiz'
import { t } from './i18n'
import { handle } from './ipc'
import type { Store } from './store'

const QUIZ_LENGTH = 10

/** Registers the flashcard channels on top of the app store and the read-only dictionary. */
export function registerDeckHandlers(store: Store, dictionary: () => Database.Database): void {
  const limits = () => {
    const s = store.settings.get()
    return { newPerDay: s.newCardsPerDay, reviewsPerDay: s.reviewsPerDay }
  }
  const familyWords = (rootId?: number): string[] | undefined =>
    rootId === undefined ? undefined : rootFamilyWords(dictionary(), rootId)

  handle(IPC.deckAdd, (req) => {
    const db = dictionary()
    const words = 'rootId' in req ? rootFamilyWords(db, req.rootId) : req.words
    const known = words.filter((w) => findWordId(db, w) !== null)
    const res = store.deck.add(known)
    return { added: res.added, skipped: res.skipped + (words.length - known.length) }
  })
  handle(IPC.deckRemove, ({ word }) => store.deck.remove(word))
  handle(IPC.deckHas, ({ words }) => store.deck.has(words))

  handle(IPC.deckNext, (req) => {
    const words = familyWords(req?.rootId)
    const card = store.deck.next(limits(), words)
    if (!card) return null
    const db = dictionary()
    const id = findWordId(db, card.word)
    const entry = id === null ? null : getWord(db, id)
    if (!entry) return null
    return { card, entry, remaining: store.deck.remaining(limits(), words) }
  })
  handle(IPC.deckReview, ({ word, grade }) => store.deck.review(word, grade))

  handle(IPC.deckStats, () => {
    const counts = store.deck.stats()
    const words = store.deck.cards().map((c) => c.word)
    return { ...counts, roots: rootMastery(dictionary(), words, store.deck.matureWords()) }
  })

  handle(IPC.deckQuiz, (req) =>
    buildQuiz(
      dictionary(),
      store.deck.cards().map((c) => c.word),
      req?.count ?? QUIZ_LENGTH,
    ),
  )
  handle(IPC.deckQuizAnswer, ({ word, correct }) => {
    store.deck.recordQuiz(word, correct)
    return null
  })

  const parent = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)
  const filters = (): Electron.FileFilter[] => [{ name: 'JSON', extensions: ['json'] }]

  handle(IPC.deckExport, async (_req, event): Promise<LearningFileResult> => {
    const win = parent(event)
    const options: Electron.SaveDialogOptions = {
      title: t('dialog.exportLearning'),
      defaultPath: join(app.getPath('documents'), 'engclaw-learning-v1.json'),
      filters: filters(),
    }
    const res = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return { status: 'cancelled' }
    try {
      const file = store.deck.export()
      await writeFile(res.filePath, JSON.stringify(file))
      return { status: 'exported', count: file.cards.length, path: res.filePath }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })

  handle(IPC.deckImport, async (_req, event): Promise<LearningFileResult> => {
    const win = parent(event)
    const options: Electron.OpenDialogOptions = {
      title: t('dialog.importLearning'),
      properties: ['openFile'],
      filters: filters(),
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    const picked = res.filePaths[0]
    if (res.canceled || !picked) return { status: 'cancelled' }
    try {
      const raw: unknown = JSON.parse(await readFile(picked, 'utf8'))
      const db = dictionary()
      return {
        status: 'imported',
        ...store.deck.import(raw, (word) => findWordId(db, word) !== null),
      }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })

  handle(IPC.transcriptExport, async (req, event): Promise<TextFileResult> => {
    const win = parent(event)
    const name =
      basename(req.fileName)
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .trim() || 'transcript.txt'
    const options: Electron.SaveDialogOptions = {
      title: t('dialog.exportTranscript'),
      defaultPath: join(app.getPath('documents'), name),
      filters: [{ name: 'Text', extensions: ['txt'] }],
    }
    const res = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return { status: 'cancelled' }
    try {
      await writeFile(res.filePath, req.text, 'utf8')
      return { status: 'saved', path: res.filePath }
    } catch (e) {
      return { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })
}
