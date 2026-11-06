import type { InferenceErrorCode } from '@engclaw/ipc-contract'

/** Messages between main and the inference utility process. */
export type RpcRequest = {
  type: 'rpc'
  id: number
  method: 'analyze' | 'transcribe' | 'phonemize' | 'speak' | 'intonation' | 'prosody'
  params: Record<string, unknown>
}
export type RpcCancel = { type: 'rpc-cancel'; id: number }
export type RpcProgress = { type: 'rpc-progress'; id: number; stage: string }
export type RpcResult =
  | { type: 'rpc-result'; id: number; ok: true; value: unknown }
  | {
      type: 'rpc-result'
      id: number
      ok: false
      code: InferenceErrorCode
      message: string
      modelId?: string
    }
