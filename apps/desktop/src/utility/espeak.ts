import { promisify } from 'node:util'
import { espeakPcm } from './speech-wav'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { PhonemizeBackend } from '@engclaw/pronounce'

export interface EspeakOptions {
  /** Path to the `espeak-ng` executable. */
  binary: string
  /** Optional espeak data dir (`--path`). */
  dataPath?: string
}

interface Pending {
  resolve: (line: string) => void
  reject: (err: Error) => void
}

/**
 * One long-lived `espeak-ng -q -v en-us --ipa --sep=_` child: a line in on stdin yields exactly one
 * line out on stdout (callers strip punctuation first). Respawns lazily after a crash.
 */
export class EspeakProcess implements PhonemizeBackend {
  private child: ChildProcessWithoutNullStreams | null = null
  private queue: Pending[] = []
  private buffer = ''

  constructor(private readonly options: EspeakOptions) {}

  phonemize(lines: string[]): Promise<string[]> {
    const child = this.ensure()
    const results = lines.map(
      (line) =>
        new Promise<string>((resolve, reject) => {
          this.queue.push({ resolve, reject })
          child.stdin.write(line.replace(/[\r\n]+/g, ' ') + '\n')
        }),
    )
    return Promise.all(results)
  }

  dispose(): void {
    const child = this.child
    this.child = null
    child?.kill()
    this.fail(new Error('espeak-ng disposed'))
  }

  private ensure(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    const args = ['-q', '-v', 'en-us', '--ipa', '--sep=_']
    if (this.options.dataPath) args.push(`--path=${this.options.dataPath}`)
    const child = spawn(this.options.binary, args)
    this.child = child
    this.buffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      let nl: number
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl)
        this.buffer = this.buffer.slice(nl + 1)
        this.queue.shift()?.resolve(line)
      }
    })
    const onGone = (err: Error): void => {
      // A stale child (disposed or replaced) must not fail requests queued on its successor.
      if (this.child !== child) return
      this.child = null
      this.fail(err)
    }
    child.on('error', (err: NodeJS.ErrnoException) =>
      onGone(
        err.code === 'ENOENT'
          ? new Error(
              `espeak-ng was not found (${this.options.binary}). Install it (brew install espeak-ng) or run scripts/espeak/build.sh.`,
            )
          : err,
      ),
    )
    child.on('exit', (code) => onGone(new Error(`espeak-ng exited (${code})`)))
    child.stdin.on('error', onGone)
    return child
  }

  private fail(err: Error): void {
    const pending = this.queue
    this.queue = []
    for (const p of pending) p.reject(err)
  }
}

// A trailing pause lets eSpeak release voiced stops and /dʒ/ without adding a vowel.
const ENGLISH_IPA: ReadonlyMap<string, string> = new Map([
  ['p', 'p'],
  ['b', 'b_'],
  ['t', 't'],
  ['d', 'd_'],
  ['k', 'k'],
  ['ɡ', 'g_'],
  ['m', 'm'],
  ['n', 'n'],
  ['ŋ', 'N'],
  ['f', 'f'],
  ['v', 'v'],
  ['θ', 'T'],
  ['ð', 'D'],
  ['s', 's'],
  ['z', 'z'],
  ['ʃ', 'S'],
  ['ʒ', 'Z'],
  ['h', 'h'],
  ['tʃ', 'tS'],
  ['dʒ', 'dZ_'],
  ['l', 'l'],
  ['ɹ', 'r-'],
  ['j', 'j'],
  ['w', 'w'],
  ['i', 'i:'],
  ['ɪ', "'I"],
  ['ɛ', 'E'],
  ['æ', 'a'],
  ['ɑ', 'A:'],
  ['ɒ', '0'],
  ['ɔ', 'O:'],
  ['ʊ', 'U'],
  ['u', 'u:'],
  ['ʌ', 'V'],
  ['ə', '@'],
  ['ɜ', '3:'],
  ['ɝ', '3'],
  ['ɚ', '3'],
  ['eɪ', 'eI'],
  ['aɪ', 'aI'],
  ['ɔɪ', 'OI'],
  ['oʊ', 'oU'],
  ['əʊ', 'oU'],
  ['aʊ', 'aU'],
  ['ɪə', "'I@"],
  ['eə', 'e@'],
  ['ʊə', 'U@'],
])
const ENGLISH_EXAMPLES: ReadonlyMap<string, string> = new Map([
  ['ə:about', "@b'aUt"],
  ['ɝ:bird', "b'3d"],
  ['ɪə:near', "n'I@"],
])
const BRITISH_IPA = new Set(['ɒ', 'ɜ', 'əʊ', 'ɪə', 'eə', 'ʊə'])

export function englishIpaArgs(
  ipa: string,
  dataPath: string | undefined,
  example?: string,
): string[] {
  const phoneme = ENGLISH_IPA.get(ipa)
  if (!phoneme) throw new Error(`Unsupported English IPA sound: ${ipa}`)
  const voice = BRITISH_IPA.has(ipa) ? 'en-gb' : 'en-us'
  const explicit = example ? ENGLISH_EXAMPLES.get(`${ipa}:${example}`) : phoneme
  // Brackets tell eSpeak to read the encoded phonemes directly.
  const args = ['-v', voice]
  if (!example && ipa === 'ɝ') args.push('-s', '125')
  if (!example && ipa === 'ɚ') args.push('-s', '215')
  if (dataPath) args.push(`--path=${dataPath}`)
  args.push('--', explicit ? `[[${explicit}]]` : (example ?? ''))
  return args
}

export async function speakEnglishIpa(
  ipa: string,
  { binary, dataPath }: EspeakOptions,
  example?: string,
): Promise<Float32Array> {
  const { stdout } = await promisify(execFile)(
    binary,
    ['--stdout', ...englishIpaArgs(ipa, dataPath, example)],
    { encoding: 'buffer', timeout: 5000 },
  )
  return espeakPcm(stdout)
}
