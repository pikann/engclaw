import { access, constants, mkdir, statfs } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface DirCheck {
  dir: string
  writable: boolean
  /** Free bytes on the volume that holds (or would hold) `dir`. */
  freeBytes: number
}

/** Free bytes on the volume holding `dir`, probing the nearest existing parent. */
export async function freeSpaceOf(dir: string): Promise<number> {
  let probe = dir
  for (;;) {
    try {
      const s = await statfs(probe)
      return s.bavail * s.bsize
    } catch {
      const up = dirname(probe)
      if (up === probe) return Number.MAX_SAFE_INTEGER
      probe = up
    }
  }
}

/** Whether models can be written to `dir` (creating it if needed) and how much room is left. */
export async function checkModelsDir(
  dir: string,
  freeSpace: (dir: string) => Promise<number> = freeSpaceOf,
): Promise<DirCheck> {
  let writable = true
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK)
  } catch {
    writable = false
  }
  return { dir, writable, freeBytes: await freeSpace(dir) }
}
