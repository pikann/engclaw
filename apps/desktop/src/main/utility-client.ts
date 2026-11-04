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

interface Pending {
  resolve(value: unknown): void
  reject(e: RpcFailure): void
  onProgress?: (stage: string) => void
  child: UtilityLike
}

/**
 * Request/response + progress + cancel over the utility process. If the process dies, in-flight
 * calls fail with PROCESS_CRASHED and the next call transparently starts a fresh process (models
 * reload lazily there).
 */
export class UtilityClient {
  private child: UtilityLike | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()

  constructor(private readonly spawn: () => UtilityLike) {}

  call<T>(
    method: RpcRequest['method'],
    params: Record<string, unknown>,
    opts: { onProgress?: (stage: string) => void; signal?: AbortSignal } = {},
  ): { id: number; result: Promise<T> } {
    const child = this.ensure()
    const id = this.nextId++
    const result = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
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
    if (this.pending.has(id)) this.child?.postMessage({ type: 'rpc-cancel', id })
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
      for (const [id, entry] of this.pending) {
        if (entry.child !== child) continue
        this.pending.delete(id)
        entry.reject(new RpcFailure('PROCESS_CRASHED', 'the inference process exited unexpectedly'))
      }
    })
    return child
  }
}
