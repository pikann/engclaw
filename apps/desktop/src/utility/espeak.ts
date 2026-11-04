import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
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
    child.on('error', onGone)
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
