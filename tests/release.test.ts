/** Static checks that keep the release pipeline honest (ENGC-57). */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8')
const builder = read('apps/desktop/electron-builder.yml')
const workflow = read('.github/workflows/release.yml')

describe('electron-builder config', () => {
  it('uploads into the maintainer-created release even when it is already published', () => {
    expect(builder).toMatch(/publish:\n\s+provider: github/)
    expect(builder).toMatch(/releaseType: release/)
  })

  it('builds the macOS zip that electron-updater needs', () => {
    expect(builder).toMatch(/mac:[\s\S]*- zip/)
  })

  it('never ships models inside the installer, so an app update cannot re-download them', () => {
    const extra = builder.match(/extraResources:\n((?:\s+.*\n)+?)npmRebuild/)?.[1] ?? ''
    expect(extra).not.toMatch(/models\/|kokoro|whisper/i)
    expect(read('apps/desktop/src/main/settings.ts')).toContain("app.getPath('userData'), 'models'")
  })
})

describe('release workflow', () => {
  it('is tag-driven and leaves creating the release to the maintainer', () => {
    expect(workflow).toMatch(/tags:\s*\n\s*- 'v\*/)
    expect(workflow).not.toContain('gh release create')
    expect(workflow).toContain('Require a GitHub release for this tag')
  })

  it('signs and notarizes macOS from encrypted secrets only', () => {
    for (const s of ['CSC_LINK', 'APPLE_API_KEY', 'APPLE_API_ISSUER', 'WIN_CSC_LINK'])
      expect(workflow).toContain(`secrets.${s}`)
    expect(workflow).toContain('mac.notarize=true')
  })

  it('publishes SHA256SUMS for every tag, pre-releases included', () => {
    expect(workflow).toContain('SHA256SUMS')
    expect(workflow).not.toMatch(/checksums:[\s\S]*?if:/)
  })
})

describe('speech detector in installers', () => {
  const { assertSpeechDetector } = createRequire(import.meta.url)(
    '../apps/desktop/build/after-pack.cjs',
  ) as { assertSpeechDetector(resourcesDir: string): void }

  // These workflows call electron-builder directly, so the package.json `pre*` hooks never run.
  it.each(['release.yml', 'packaging.yml'])('%s fetches the model before packaging', (name) => {
    const text = read('.github/workflows', name)
    const fetched = text.indexOf('run: bun run vad')
    expect(fetched).toBeGreaterThan(-1)
    expect(fetched).toBeLessThan(text.indexOf('bunx electron-builder'))
  })

  it('fails a build whose packaged resources lack the model', () => {
    const resources = mkdtempSync(join(tmpdir(), 'engclaw-resources-'))
    expect(() => assertSpeechDetector(resources)).toThrow('bun run vad')
    mkdirSync(join(resources, 'vad'))
    writeFileSync(join(resources, 'vad', 'silero_vad_16k_op15.onnx'), 'model')
    expect(() => assertSpeechDetector(resources)).not.toThrow()
  })
})
