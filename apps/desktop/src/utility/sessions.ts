import { createRequire } from 'node:module'
import { join } from 'node:path'

export type Ort = typeof import('onnxruntime-node')

/** Execution providers in preference order: WebGPU, then CPU (owner decision, see System Architecture). */
export const DEFAULT_PROVIDERS = ['webgpu', 'cpu']

export const loadOrt = (): Ort =>
  createRequire(join(__dirname, 'utility.js'))('onnxruntime-node') as Ort

/** The one place sessions are created; every model (wav2vec2, Kokoro) goes through it. */
export async function createSession(
  path: string,
  providers: string[] = DEFAULT_PROVIDERS,
): Promise<{ ort: Ort; session: import('onnxruntime-node').InferenceSession }> {
  const ort = loadOrt()
  const session = await ort.InferenceSession.create(path, { executionProviders: providers })
  return { ort, session }
}
