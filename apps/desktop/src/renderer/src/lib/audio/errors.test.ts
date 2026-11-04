import { expect, it } from 'vitest'
import { classifyMicError, micGuidance } from './errors'

const dom = (name: string) => Object.assign(new Error(name), { name })

it('maps getUserMedia failures to reasons', () => {
  expect(classifyMicError(dom('NotAllowedError'))).toBe('denied')
  expect(classifyMicError(dom('SecurityError'))).toBe('denied')
  expect(classifyMicError(dom('NotFoundError'))).toBe('notfound')
  expect(classifyMicError(dom('OverconstrainedError'))).toBe('notfound')
  expect(classifyMicError(dom('NotReadableError'))).toBe('unknown')
  expect(classifyMicError('boom')).toBe('unknown')
})

it('gives OS-specific guidance for denied access', () => {
  expect(micGuidance('denied', 'darwin')).toBe('audio.mic.denied.macos')
  expect(micGuidance('denied', 'win32')).toBe('audio.mic.denied.windows')
  expect(micGuidance('denied', 'linux')).toBe('audio.mic.denied.generic')
  expect(micGuidance('notfound', 'darwin')).toBe('audio.mic.notfound')
  expect(micGuidance('unknown', 'win32')).toBe('audio.mic.unknown')
})
