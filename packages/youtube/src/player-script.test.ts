import { describe, expect, it } from 'vitest'
import { evaluatePlayerScript } from './player-script'

describe('YouTube player script interpreter', () => {
  it('evaluates return values in an isolated interpreter without host APIs', async () => {
    await expect(
      evaluatePlayerScript(
        "return { n: 'abc'.split('').reverse().join(''), host: typeof process, network: typeof fetch, imports: typeof require };",
      ),
    ).resolves.toEqual({ n: 'cba', host: 'undefined', network: 'undefined', imports: 'undefined' })
  })
  it('interrupts scripts that do not terminate', async () => {
    await expect(evaluatePlayerScript('while (true) {}', 20)).rejects.toBeDefined()
  })
})
