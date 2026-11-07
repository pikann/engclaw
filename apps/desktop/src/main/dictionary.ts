import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { getRoot, getWord, listRootOrigins, listRoots, searchWords } from '@engclaw/dictionary'
import { IPC } from '@engclaw/ipc-contract'
import { handle } from './ipc'

const dictionaryPath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'dictionary.sqlite')
    : join(app.getAppPath(), 'resources', 'data', 'dictionary.sqlite')

/** Registers the read-only dictionary channels; returns the lazy database opener for other features. */
export function registerDictionaryHandlers(): () => Database.Database {
  let db: Database.Database | undefined
  const open = (): Database.Database =>
    (db ??= new Database(dictionaryPath(), { readonly: true, fileMustExist: true }))

  handle(IPC.dictionarySearch, ({ query, limit }) => searchWords(open(), query, limit))
  handle(IPC.dictionaryWord, ({ id }) => getWord(open(), id))
  handle(IPC.dictionaryRoot, ({ id }) => getRoot(open(), id))
  handle(IPC.dictionaryRoots, (req) => ({
    roots: listRoots(open(), req ?? {}),
    origins: listRootOrigins(open()),
  }))
  app.on('will-quit', () => db?.close())
  return open
}
