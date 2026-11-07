import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '@engclaw/dictionary'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildQuiz } from './deck-quiz'

let db: Database.Database

beforeAll(() => {
  db = new Database(':memory:')
  db.exec(SCHEMA_SQL)
  db.exec(`
    INSERT INTO entries (id, word, norm) VALUES
      (1, 'inspect', 'inspect'), (2, 'spectator', 'spectator'), (3, 'inbox', 'inbox'),
      (4, 'telescope', 'telescope'), (5, 'blank', 'blank');
    INSERT INTO senses VALUES
      (1, 0, 'v', 'look over carefully', NULL), (2, 0, 'n', 'someone who watches', NULL),
      (3, 0, 'n', 'a tray for mail', NULL), (4, 0, 'n', 'a tube for seeing far', NULL);
    INSERT INTO pronunciations VALUES (1, 0, 'ˌɪnˈspɛkt');
  `)
})

describe('buildQuiz', () => {
  it('asks for the definition of a word, with the right answer among distractors', () => {
    const [q] = buildQuiz(db, ['inspect'], 1)
    expect(q).toMatchObject({ word: 'inspect', ipa: 'ˌɪnˈspɛkt' })
    expect(q!.options).toHaveLength(4)
    expect(new Set(q!.options).size).toBe(4)
    expect(q!.options[q!.answer]).toBe('look over carefully')
  })

  it('limits the count and skips words with no definition', () => {
    const qs = buildQuiz(db, ['inspect', 'blank', 'inbox', 'telescope', 'spectator'], 3)
    expect(qs).toHaveLength(3)
    expect(qs.map((q) => q.word)).not.toContain('blank')
  })

  it('returns nothing for an empty deck', () => {
    expect(buildQuiz(db, [], 10)).toEqual([])
  })
})
