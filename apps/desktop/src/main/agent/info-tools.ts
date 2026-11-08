import { z } from '@engclaw/ipc-contract'
import type { HistoryAttempt } from '@engclaw/ipc-contract'
import { defineTool } from './tools'

/** Read-only view of the dictionary; the agent never sees the database handle. */
export interface DictionarySource {
  lookup(word: string): {
    word: string
    ipa: string[]
    senses: { pos: string; definition: string; example: string | null }[]
    morphemes: { kind: string; form: string; meaning: string }[]
  } | null
}

/** Read-only view of practice attempts, newest first. */
export interface HistorySource {
  recent(limit: number): HistoryAttempt[]
}

const MAX_SENSES = 4
const MAX_ATTEMPTS = 20
const MAX_TEXT = 200
const MAX_PROBLEMS = 8

const clip = (s: string): string => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s)

export const lookupDictionaryTool = (source: DictionarySource) =>
  defineTool({
    description:
      "Look up an English word in the offline dictionary: definitions, part of speech, IPA, word parts (prefix/root/suffix) and an example. Use it when you need exact facts about a word the learner asks about. Returns found:false when the word isn't in the dictionary.",
    schema: z.object({ word: z.string().trim().min(1).max(64) }),
    async run({ word }) {
      const entry = source.lookup(word)
      if (!entry) return { found: false, word }
      return {
        found: true,
        word: entry.word,
        ipa: entry.ipa.slice(0, 2),
        senses: entry.senses.slice(0, MAX_SENSES).map((s) => ({
          pos: s.pos,
          definition: clip(s.definition),
          ...(s.example && { example: clip(s.example) }),
        })),
        parts: entry.morphemes.map((m) => ({
          kind: m.kind,
          form: m.form,
          meaning: clip(m.meaning),
        })),
      }
    },
  })

export const practiceHistoryTool = (source: HistorySource) =>
  defineTool({
    description:
      "Read the learner's recent practice attempts (sentence, score 0-100) and the words and sounds they most often get wrong. Use it when you want to tailor your reply to their weak spots or progress. Returns empty:true when they haven't practiced yet.",
    schema: z.object({
      limit: z.number().int().min(1).max(MAX_ATTEMPTS).default(10),
      mode: z.enum(['sentence', 'free']).optional(),
    }),
    async run({ limit, mode }) {
      const attempts = source
        .recent(MAX_ATTEMPTS)
        .filter((a) => mode === undefined || a.mode === mode)
        .slice(0, limit)
      if (attempts.length === 0) return { empty: true }

      const problems = new Map<string, { count: number; heard: Set<string> }>()
      for (const a of attempts)
        for (const e of a.errors) {
          const p = problems.get(e.word) ?? { count: 0, heard: new Set<string>() }
          p.count++
          p.heard.add(e.actual)
          problems.set(e.word, p)
        }

      return {
        empty: false,
        averageScore: Math.round(attempts.reduce((n, a) => n + a.score, 0) / attempts.length),
        attempts: attempts.map((a) => ({
          at: new Date(a.createdAt).toISOString().slice(0, 10),
          mode: a.mode,
          text: clip(a.text),
          score: Math.round(a.score),
        })),
        problemWords: [...problems]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, MAX_PROBLEMS)
          .map(([word, p]) => ({ word, times: p.count, heardAs: [...p.heard].slice(0, 2) })),
      }
    },
  })
