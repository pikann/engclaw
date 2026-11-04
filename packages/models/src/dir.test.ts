import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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

  it('reports a folder that cannot be created as unwritable', async () => {
    // A path below a regular file can never be created, on any OS or user.
    const file = join(root, 'file')
    await writeFile(file, 'x')
    expect((await checkModelsDir(join(file, 'models'), async () => 1)).writable).toBe(false)
  })
})
