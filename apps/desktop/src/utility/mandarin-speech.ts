import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { espeakPcm } from './speech-wav'
import { resolveEspeak } from './espeak-binary'

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

const iongInitials: Record<string, string> = { j: 'tS;', q: 'tS;h', x: 'S;' }
const espeakTones: Record<string, string> = { 1: '55', 2: '35', 3: '214', 4: '51', 5: '11' }

export function espeakPinyinInput(text: string): string {
  // The bundled Mandarin rules send j/q/x + iong to the English voice. Spell out
  // those syllables in eSpeak's Mandarin phoneme alphabet, including the requested tone.
  return text.replace(
    /(?<![a-z])([jqx])iong([1-5])/gu,
    (_, initial: string, tone: string) => `[[${iongInitials[initial]}ju${espeakTones[tone]}N]]`,
  )
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
    const input = text.replace(/[\r\n]+/g, ' ')
    child.stdin?.end(pinyin ? espeakPinyinInput(input) : input)
  })
}
