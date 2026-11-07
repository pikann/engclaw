import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  findWordId,
  firstPronunciation,
  primaryDefinition,
  randomDefinitions,
  rootFamilyWords,
  rootMastery,
} from './learn'
import { SCHEMA_SQL } from './schema'
import type { SqlDb } from './search'

const require = createRequire(new URL('../../../apps/desktop/package.json', import.meta.url))
const Database = require('better-sqlite3') as new (path: string) => SqlDb & {
  exec(sql: string): void
}

let db: SqlDb

beforeAll(() => {
  const d = new Database(':memory:')
  d.exec(SCHEMA_SQL)
  d.exec(`
    INSERT INTO entries (id, word, norm) VALUES
      (1, 'inspect', 'inspect'), (2, 'spectator', 'spectator'), (3, 'inbox', 'inbox'),
      (4, 'telescope', 'telescope');
    INSERT INTO senses VALUES
      (1, 0, 'v', 'look over carefully', NULL), (1, 1, 'v', 'examine officially', NULL),
      (2, 0, 'n', 'someone who watches', NULL), (3, 0, 'n', 'a tray for mail', NULL),
      (4, 0, 'n', 'a tube for seeing far', NULL);
    INSERT INTO pronunciations VALUES (1, 1, 'second'), (1, 0, 'ˌɪnˈspɛkt');
    INSERT INTO roots VALUES
      (10, 'in', '["in"]', 'in, into', '["Latin"]', 'u'),
      (11, 'spect', '["spect"]', 'look', '["Latin"]', 'u'),
      (12, 'scop', '["scop"]', 'see', '["Greek"]', 'u');
    INSERT INTO morphemes VALUES
      (1, 0, 'prefix', 'in', 10), (1, 1, 'root', 'spect', 11), (2, 0, 'root', 'spect', 11),
      (3, 0, 'prefix', 'in', 10), (4, 0, 'root', 'scop', 12);
  `)
  db = d
})

describe('learn helpers', () => {
  it('finds a word id by exact text', () => {
    expect(findWordId(db, 'inspect')).toBe(1)
    expect(findWordId(db, 'nope')).toBeNull()
  })

  it('lists a root family alphabetically', () => {
    expect(rootFamilyWords(db, 11)).toEqual(['inspect', 'spectator'])
    expect(rootFamilyWords(db, 999)).toEqual([])
  })

  it('reports mastery only for roots with deck words', () => {
    const rows = rootMastery(db, ['inspect', 'telescope'], new Set(['inspect']))
    expect(rows.map((r) => [r.root, r.inDeck, r.mature, r.total])).toEqual([
      ['in', 1, 1, 2],
      ['spect', 1, 1, 2],
      ['scop', 1, 0, 1],
    ])
  })

  it('reads the first definition and pronunciation', () => {
    expect(primaryDefinition(db, 'inspect')).toBe('look over carefully')
    expect(firstPronunciation(db, 'inspect')).toBe('ˌɪnˈspɛkt')
    expect(primaryDefinition(db, 'nope')).toBeNull()
    expect(firstPronunciation(db, 'telescope')).toBeNull()
  })

  it('picks distractor definitions that exclude the answer', () => {
    const d = randomDefinitions(db, 'inspect', 'look over carefully', 3)
    expect(d).toHaveLength(3)
    expect(d).not.toContain('look over carefully')
  })
})
