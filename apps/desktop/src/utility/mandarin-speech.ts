import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { resampleLinear } from '@engclaw/pronounce'
import { resolveEspeak } from './espeak-binary'

/** Handles RIFF chunks, including espeak's streaming WAV with an unknown data length. */
export function espeakPcm(wav: Buffer): Float32Array {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('Invalid speech WAV')
  let rate = 0
  for (let offset = 12; offset + 8 <= wav.length;) {
    const name = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (name === 'fmt ') {
      if (
        size < 16 ||
        start + 16 > wav.length ||
        wav.readUInt16LE(start) !== 1 ||
        wav.readUInt16LE(start + 2) !== 1 ||
        wav.readUInt16LE(start + 14) !== 16
      )
        throw new Error('Expected mono PCM16')
      rate = wav.readUInt32LE(start + 4)
    }
    if (name === 'data') {
      if (!rate) throw new Error('Missing sample rate')
      const count = Math.floor(Math.min(size, wav.length - start) / 2)
      if (!count) throw new Error('Empty speech audio')
      const samples = Float32Array.from(
        { length: count },
        (_, i) => wav.readInt16LE(start + i * 2) / 32768,
      )
      return resampleLinear(samples, rate, 16000)
    }
    offset = start + size + (size % 2)
  }
  throw new Error('Missing speech data')
}

const run = promisify(execFile)

async function speakWithTingting(text: string): Promise<Float32Array> {
  const dir = await mkdtemp(join(tmpdir(), 'engclaw-mandarin-'))
  try {
    const source = join(dir, 'text.txt')
    const audio = join(dir, 'voice.wav')
    // Brackets can introduce embedded speech commands in macOS speech synthesis.
    await writeFile(source, text.replaceAll('[', ' ').replaceAll(']', ' '))
    await run(
      '/usr/bin/say',
      ['-v', 'Tingting', '--data-format=LEI16@16000', '-f', source, '-o', audio],
      { timeout: 15_000 },
    )
    return espeakPcm(await readFile(audio))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Use macOS Mandarin speech when a matching Chinese reading is available, with an offline fallback. */
export async function speakMandarin(
  text: string,
  pinyin = false,
  nativeText?: string,
): Promise<{ samples: Float32Array; pinyinFallback?: true }> {
  if (process.platform === 'darwin' && nativeText) {
    try {
      return { samples: await speakWithTingting(nativeText) }
    } catch {
      // A system voice can be absent or fail to initialize.
    }
  }
  const location = resolveEspeak()
  const args = ['-v', pinyin ? 'cmn-Latn-pinyin' : 'cmn', '--stdout', '--stdin']
  if (location.dataPath) args.push(`--path=${location.dataPath}`)
  return new Promise((resolve, reject) => {
    const child = execFile(
      location.binary,
      args,
      { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
      (error, stdout) => {
        if (error) return reject(error)
        try {
          resolve({ samples: espeakPcm(stdout), ...(pinyin ? { pinyinFallback: true } : {}) })
        } catch (e) {
          reject(e)
        }
      },
    )
    child.stdin?.on('error', reject)
    // Whole phrases arrive joined; explicit commas mark pauses in the segmented sample.
    child.stdin?.end(text.replace(/[\r\n]+/g, ' '))
  })
}
