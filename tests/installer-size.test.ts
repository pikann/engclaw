import { describe, expect, it } from 'vitest'
import { checkInstallerSizes } from '../scripts/perf/installer-size'

const MB = 1e6

describe('checkInstallerSizes', () => {
  it('flags installers over the budget and ignores other files', () => {
    const out = checkInstallerSizes(
      [
        { file: 'Engclaw-1.0.0.dmg', bytes: 200 * MB },
        { file: 'Engclaw-1.0.0.AppImage', bytes: 251 * MB },
        { file: 'builder-debug.yml', bytes: 900 * MB },
      ],
      250,
    )
    expect(out.map((v) => [v.file, v.ok])).toEqual([
      ['Engclaw-1.0.0.dmg', true],
      ['Engclaw-1.0.0.AppImage', false],
    ])
  })

  it('accepts a file exactly at the budget', () => {
    expect(checkInstallerSizes([{ file: 'a.exe', bytes: 250 * MB }], 250)[0]!.ok).toBe(true)
  })
})
