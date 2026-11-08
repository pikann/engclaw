import { describe, expect, it } from 'vitest'
import {
  DIFFICULTY_WEIGHTS,
  WORLD_SIZE,
  difficultyComponents,
  difficultyOf,
  maxNeighbourJump,
  rankChapters,
  worldSizes,
  type DifficultyInput,
} from './difficulty'

type Item = DifficultyInput & { id: string }

const item = (text: string, type: Item['type'], ipa: string, frequencyRank: number): Item => ({
  id: text.replace(/ /g, '-'),
  text,
  type,
  ipa,
  frequencyRank,
})

const cat = item('cat', 'word', 'ˈkæt', 1027)
const dog = item('dog', 'word', 'ˈdɔɡ', 529)
const thoroughly = item('thoroughly', 'word', 'ˈθɝoʊli', 7038)
const strengths = item('strengths', 'word', 'ˈstɹɛŋkθs', 14476)
const breakALeg = item('break a leg', 'idiom', 'ˈbɹeɪk ə ˈlɛɡ', 1256)
const kickTheBucket = item('kick the bucket', 'idiom', 'ˈkɪk ðə ˈbʌkət', 4017)
const aLot = item('a lot', 'phrase', 'ə ˈlɑt', 193)

describe('difficultyOf', () => {
  it('ranks the reference examples from easy to hard', () => {
    const d = (c: Item) => difficultyOf(c)
    expect(d(cat)).toBeLessThan(d(thoroughly))
    expect(d(thoroughly)).toBeLessThan(d(breakALeg))
    expect(d(dog)).toBeLessThan(d(aLot))
    expect(d(aLot)).toBeLessThan(d(kickTheBucket))
    expect(d(thoroughly)).toBeLessThan(d(strengths))
  })

  it('stays within 0..100 and is reproducible', () => {
    for (const c of [cat, thoroughly, strengths, breakALeg]) {
      const v = difficultyOf(c)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
      expect(difficultyOf({ ...c })).toBe(v)
    }
    expect(difficultyOf({ ...cat, frequencyRank: 1, ipa: '' })).toBeGreaterThanOrEqual(0)
  })

  it('rarer words are harder, all else equal', () => {
    expect(difficultyOf({ ...cat, frequencyRank: 20000 })).toBeGreaterThan(difficultyOf(cat))
  })

  it('ranks idioms above plain words of similar frequency and shape', () => {
    const word = item('leg', 'word', 'ˈlɛɡ', 1256)
    expect(difficultyOf({ ...word, type: 'idiom' })).toBeGreaterThan(difficultyOf(word))
    expect(difficultyOf({ ...word, type: 'phrase' })).toBeGreaterThan(difficultyOf(word))
  })

  it('counts learner-hard sounds, clusters, stress and weak forms', () => {
    const c = (text: string, ipa: string, type: Item['type'] = 'word') =>
      difficultyComponents({ text, type, ipa, frequencyRank: 500 })
    expect(c('thick', 'ˈθɪk').sounds).toBeGreaterThan(c('pick', 'ˈpɪk').sounds)
    expect(c('strengths', 'ˈstɹɛŋkθs').clusters).toBeGreaterThan(c('cat', 'ˈkæt').clusters)
    expect(c('photography', 'fəˈtɑɡɹəfi').stress).toBeGreaterThan(c('cat', 'ˈkæt').stress)
    expect(c('a lot', 'ə ˈlɑt', 'phrase').weakForms).toBeGreaterThan(0)
    expect(c('lot', 'ˈlɑt').weakForms).toBe(0)
  })

  it('weights sum to one', () => {
    expect(Object.values(DIFFICULTY_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
})

describe('rankChapters', () => {
  const items = [cat, dog, thoroughly, strengths, breakALeg, kickTheBucket, aLot]

  it('is deterministic regardless of input order', () => {
    const a = rankChapters(items)
    const b = rankChapters([...items].reverse())
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
  })

  it('assigns a unique 1..n order with cat before thoroughly before break a leg', () => {
    const r = rankChapters(items)
    expect([...r.values()].map((x) => x.order).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(r.get('cat')!.order).toBeLessThan(r.get('thoroughly')!.order)
    expect(r.get('thoroughly')!.order).toBeLessThan(r.get('break-a-leg')!.order)
  })

  it('breaks ties by frequency rank, then id', () => {
    const a = { ...cat, id: 'b', frequencyRank: 100 }
    const b = { ...cat, id: 'a', frequencyRank: 100 }
    const c = { ...cat, id: 'c', frequencyRank: 90 }
    const r = rankChapters([a, b, c])
    expect(r.get('c')!.order).toBeLessThan(r.get('a')!.order)
    expect(r.get('a')!.order).toBeLessThan(r.get('b')!.order)
  })
})

describe('worldSizes', () => {
  it('sums to the total and keeps every world within 50..100 for realistic catalogs', () => {
    for (let total = 2000; total <= 12000; total += 137) {
      const sizes = worldSizes(total)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(total)
      for (const s of sizes) {
        expect(s).toBeGreaterThanOrEqual(WORLD_SIZE.min)
        expect(s).toBeLessThanOrEqual(WORLD_SIZE.max)
      }
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    }
  })

  it('handles tiny catalogs', () => {
    expect(worldSizes(0)).toEqual([])
    expect(worldSizes(10)).toEqual([10])
  })
})

describe('maxNeighbourJump', () => {
  it('measures the largest step between consecutive chapters', () => {
    expect(
      maxNeighbourJump([
        { difficulty: 1, order: 1, world: 1 },
        { difficulty: 9, order: 3, world: 1 },
        { difficulty: 4, order: 2, world: 1 },
      ]),
    ).toBe(5)
  })
})
