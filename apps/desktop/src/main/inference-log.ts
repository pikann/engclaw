import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 1_000_000

/** Appends to `<logs>/inference.log` (rotated to `.old` past 1 MB); never throws. */
export function appendInferenceLog(text: string): void {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'inference.log')
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.old`)
    } catch {
      // no log yet
    }
    appendFileSync(file, `${new Date().toISOString()} ${text}`)
  } catch {
    // logging must never break inference
  }
}
