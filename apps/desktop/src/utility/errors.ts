import type { InferenceErrorCode } from '@engclaw/ipc-contract'

/** Typed failure that crosses the process boundary as `{ code, message, modelId? }`. */
export class InferenceError extends Error {
  constructor(
    readonly code: InferenceErrorCode,
    message: string,
    readonly modelId?: string,
  ) {
    super(message)
    this.name = 'InferenceError'
  }
}

export const toInferenceError = (e: unknown): InferenceError =>
  e instanceof InferenceError
    ? e
    : new InferenceError('FAILED', e instanceof Error ? e.message : String(e))
