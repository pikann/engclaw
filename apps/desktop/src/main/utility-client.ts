import type { InferenceErrorCode } from '@engclaw/ipc-contract'
import type { RpcProgress, RpcRequest, RpcResult } from '../utility/rpc'

export interface UtilityLike {
  postMessage(message: unknown): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: 'message' | 'exit', cb: (arg: any) => void): unknown
}

export class RpcFailure extends Error {
  constructor(
    readonly code: InferenceErrorCode,
    message: string,
    readonly modelId?: string,
  ) {
    super(message)
  }
}

/** Methods that can safely run twice, so a crash mid-request may be retried on a fresh process. */
const RETRYABLE: ReadonlySet<RpcRequest['method']> = new Set([
  'analyze',
  'transcribe',
  'phonemize',
  'speak',
])
const RETRY_WINDOW_MS = 60_000

interface Pending {
  method: RpcRequest['method']
  params: Record<string, unknown>
  cancelled: boolean
  resolve(value: unknown): void
  reject(e: RpcFailure): void
  onProgress?: (stage: string) => void
  child: UtilityLike
}

/**
 * Request/response + progress + cancel over the utility process. If the process dies, in-flight
 * calls fail with PROCESS_CRASHED and the next call transparently starts a fresh process (models
 * reload lazily there). Idempotent calls are retried once on the fresh process, but at most once
 * per minute, so a process that crashes on startup cannot loop.
 */
export class UtilityClient {
  private child: UtilityLike | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()

  private lastRetryAt = -Infinity

  constructor(
    private readonly spawn: () => UtilityLike,
    private readonly now: () => number = Date.now,
  ) {}

  call<T>(
    method: RpcRequest['method'],
    params: Record<string, unknown>,
    opts: { onProgress?: (stage: string) => void; signal?: AbortSignal } = {},
  ): { id: number; result: Promise<T> } {
    const child = this.ensure()
    const id = this.nextId++
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        method,
        params,
        cancelled: false,
        resolve: resolve as (v: unknown) => void,
        reject,
        onProgress: opts.onProgress,
        child,
      })
    })
    child.postMessage({ type: 'rpc', id, method, params } satisfies RpcRequest)
    opts.signal?.addEventListener('abort', () => this.cancel(id), { once: true })
    return { id, result }
  }

  cancel(id: number): void {
    const entry = this.pending.get(id)
    if (!entry) return
    entry.cancelled = true
    this.child?.postMessage({ type: 'rpc-cancel', id })
  }

  private ensure(): UtilityLike {
    if (this.child) return this.child
    const child = this.spawn()
    this.child = child
    child.on('message', (m: { type?: string }) => {
      if (m?.type === 'rpc-progress') {
        const p = m as RpcProgress
        this.pending.get(p.id)?.onProgress?.(p.stage)
      } else if (m?.type === 'rpc-result') {
        const r = m as RpcResult
        const entry = this.pending.get(r.id)
        this.pending.delete(r.id)
        if (!entry) return
        if (r.ok) entry.resolve(r.value)
        else entry.reject(new RpcFailure(r.code, r.message, r.modelId))
      }
    })
    child.on('exit', () => {
      if (this.child === child) this.child = null
      const crashed = [...this.pending].filter(([, entry]) => entry.child === child)
      const mayRetry = this.now() - this.lastRetryAt >= RETRY_WINDOW_MS
      let retried = false
      for (const [id, entry] of crashed) {
        if (entry.cancelled) {
          this.pending.delete(id)
          entry.reject(new RpcFailure('CANCELLED', 'cancelled'))
        } else if (mayRetry && RETRYABLE.has(entry.method)) {
          retried = true
          entry.child = this.ensure()
          entry.child.postMessage({
            type: 'rpc',
            id,
            method: entry.method,
            params: entry.params,
          } satisfies RpcRequest)
        } else {
          this.pending.delete(id)
          entry.reject(
            new RpcFailure('PROCESS_CRASHED', 'the inference process exited unexpectedly'),
          )
        }
      }
      if (retried) this.lastRetryAt = this.now()
    })
    return child
  }
}
