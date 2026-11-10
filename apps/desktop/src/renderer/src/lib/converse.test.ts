import { describe, expect, it } from 'vitest'
import {
  captionsAnnouncement,
  converseReducer,
  initialConverse,
  isCaptionsShortcut,
  type ConverseEvent,
  type ConverseState,
} from './converse'

const run = (events: ConverseEvent[], from: ConverseState = initialConverse) =>
  events.reduce(converseReducer, from)

const card = { type: 'vocabulary', word: 'market', meaning: 'a place to buy things' } as const

describe('converse turn', () => {
  it('goes listening -> thinking -> speaking -> idle with both messages kept', () => {
    let s = run([{ type: 'listen' }])
    expect(s.turn).toBe('listening')
    s = run([{ type: 'transcribing' }], s)
    expect(s).toMatchObject({ turn: 'thinking', messages: [] })
    s = run([{ type: 'heard', text: 'Hello there' }], s)
    expect(s.turn).toBe('thinking')
    s = run([{ type: 'sent', conversationId: 'c1', requestId: 'r1' }], s)
    s = run([{ type: 'delta', requestId: 'r1', text: 'Hi! ' }], s)
    s = run([{ type: 'delta', requestId: 'r1', text: 'How are you?' }], s)
    expect(s.messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: 'Hi! How are you?',
      streaming: true,
    })
    s = run(
      [
        {
          type: 'done',
          requestId: 'r1',
          conversationId: 'c1',
          text: 'Hi! How are you?',
          cards: [],
        },
      ],
      s,
    )
    expect(s.turn).toBe('speaking')
    expect(s.messages.at(-1)?.streaming).toBeUndefined()
    s = run([{ type: 'spoken' }], s)
    expect(s.turn).toBe('idle')
    expect(s.messages.map((m) => [m.role, m.text])).toEqual([
      ['user', 'Hello there'],
      ['assistant', 'Hi! How are you?'],
    ])
    expect(s.conversationId).toBe('c1')
  })

  it('stop-listening ends the transcribing phase, so an empty transcript or a cancel is not stuck', () => {
    const transcribing = run([{ type: 'listen' }, { type: 'transcribing' }])
    expect(transcribing.turn).toBe('thinking')
    expect(run([{ type: 'stop-listening' }], transcribing).turn).toBe('idle')
  })

  it('stop-listening does not interrupt a reply that is already being generated', () => {
    const replying = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r1' },
    ])
    expect(run([{ type: 'stop-listening' }], replying)).toEqual(replying)
  })

  it('ignores events of another request', () => {
    const s = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r1' },
      { type: 'delta', requestId: 'old', text: 'zzz' },
      { type: 'done', requestId: 'old', conversationId: 'c', text: 'zzz', cards: [] },
    ])
    expect(s.turn).toBe('thinking')
    expect(s.messages.map((m) => m.text)).toEqual(['a', ''])
  })

  it('barge-in while speaking keeps the reply and returns to listening', () => {
    const s = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r' },
      { type: 'done', requestId: 'r', conversationId: 'c', text: 'Long reply', cards: [] },
      { type: 'interrupt' },
      { type: 'listen' },
    ])
    expect(s.turn).toBe('listening')
    expect(s.messages.at(-1)).toMatchObject({ text: 'Long reply', interrupted: true })
  })

  it('cancelling while thinking drops the empty reply and keeps the question', () => {
    const s = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r' },
      { type: 'delta', requestId: 'r', text: 'Par' },
      { type: 'cancelled', requestId: 'r' },
    ])
    expect(s.turn).toBe('idle')
    expect(s.messages.map((m) => m.role)).toEqual(['user'])
  })

  it('an error keeps the conversation and records the code', () => {
    const s = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r' },
      { type: 'error', requestId: 'r', code: 'NETWORK' },
    ])
    expect(s).toMatchObject({ turn: 'idle', error: 'NETWORK' })
    expect(s.messages).toHaveLength(1)
  })

  it('keeps the cards of a finished reply on its message', () => {
    const s = run([
      { type: 'heard', text: 'a' },
      { type: 'sent', conversationId: 'c', requestId: 'r' },
      { type: 'done', requestId: 'r', conversationId: 'c', text: 'ok', cards: [card] },
    ])
    expect(s.messages.at(-1)).toMatchObject({ role: 'assistant', text: 'ok', cards: [card] })
  })

  it('loading a conversation replaces the transcript and new starts empty', () => {
    const s = run([
      {
        type: 'load',
        conversationId: 'c9',
        messages: [
          { id: 1, role: 'user', text: 'hi', createdAt: 1, cards: [] },
          { id: 2, role: 'assistant', text: 'yo', createdAt: 2, cards: [card] },
        ],
      },
    ])
    expect(s.conversationId).toBe('c9')
    expect(s.messages).toEqual([
      { id: 'm1', role: 'user', text: 'hi', cards: [] },
      { id: 'm2', role: 'assistant', text: 'yo', cards: [card] },
    ])
    expect(run([{ type: 'reset' }], s)).toEqual(initialConverse)
  })
})

describe('captions', () => {
  it('announces the state change, not the transcript', () => {
    expect(captionsAnnouncement(true)).toBe('shown')
    expect(captionsAnnouncement(false)).toBe('hidden')
  })

  it('shortcut is Alt+C without other modifiers', () => {
    const key = (o: Partial<KeyboardEvent>): KeyboardEvent =>
      ({
        code: 'KeyC',
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...o,
      }) as KeyboardEvent
    expect(isCaptionsShortcut(key({}))).toBe(true)
    expect(isCaptionsShortcut(key({ altKey: false }))).toBe(false)
    expect(isCaptionsShortcut(key({ metaKey: true }))).toBe(false)
    expect(isCaptionsShortcut(key({ code: 'KeyV' }))).toBe(false)
  })
})
