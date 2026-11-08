import { describe, expect, it } from 'vitest'
import { renderNotes } from '../scripts/changelog/notes'

describe('renderNotes', () => {
  it('groups conventional commits by type and drops chores', () => {
    const md = renderNotes('1.2.0', [
      'feat(dictionary): add flashcards',
      'fix: crash on empty transcript',
      'chore: bump deps',
      'not a conventional commit',
    ])
    expect(md).toBe(
      '## 1.2.0\n\n### Features\n- **dictionary:** add flashcards\n\n### Bug fixes\n- crash on empty transcript\n',
    )
  })

  it('lists breaking changes first', () => {
    const md = renderNotes('2.0.0', ['feat(ipc)!: rename channels'])
    expect(md).toContain('### Breaking changes\n- **ipc:** rename channels')
  })

  it('handles releases with nothing user-facing', () => {
    expect(renderNotes('1.0.1', ['chore: ci'])).toContain('No user-facing changes.')
  })
})
