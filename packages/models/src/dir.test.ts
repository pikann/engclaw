import { mkdtemp, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkModelsDir } from './dir'

describe('checkModelsDir', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'engclaw-dir-'))
  })
  afterEach(async () => {
    await chmod(root, 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  })

  it('reports a writable folder with its free space', async () => {
    const c = await checkModelsDir(root, async () => 5_000)
    expect(c).toEqual({ dir: root, writable: true, freeBytes: 5_000 })
  })

  it('creates a missing folder when its parent is writable', async () => {
    const dir = join(root, 'a', 'models')
    expect((await checkModelsDir(dir, async () => 1)).writable).toBe(true)
  })

  it.skipIf(process.getuid?.() === 0)('reports an unwritable folder', async () => {
    await chmod(root, 0o500)
    expect((await checkModelsDir(join(root, 'models'), async () => 1)).writable).toBe(false)
    expect((await checkModelsDir(root, async () => 1)).writable).toBe(false)
  })
})
