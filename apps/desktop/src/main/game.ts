import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { countChapters, readChapterByOrder } from '@engclaw/game'
import { IPC } from '@engclaw/ipc-contract'
import { handle } from './ipc'

const contentPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'game-content.sqlite')
    : join(app.getAppPath(), 'resources', 'data', 'game-content.sqlite')

export function registerGameHandlers(): void {
  let db: Database.Database | undefined
  const open = (): Database.Database =>
    (db ??= new Database(contentPath(), { readonly: true, fileMustExist: true }))

  handle(IPC.gameChapter, ({ order }) => {
    const chapter = readChapterByOrder(open(), order)
    return {
      chapter: chapter && {
        id: chapter.id,
        text: chapter.text,
        type: chapter.type,
        ipa: chapter.ipa,
        meaning: chapter.meaning,
        examples: chapter.examples,
        order: chapter.order,
        world: chapter.world,
      },
      total: countChapters(open()),
    }
  })
  app.on('will-quit', () => db?.close())
}
