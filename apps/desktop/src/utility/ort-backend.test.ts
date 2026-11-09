import { describe, expect, it, vi } from 'vitest'
import { ortBackend } from './model-adapter'

const tensor = (data: number[]) => ({ data: new Float32Array(data), dims: [1, data.length] })
const fakeOrt = {
  Tensor: class {
    constructor(
      public t: string,
      public d: unknown,
      public s: unknown,
    ) {}
  },
}

const session = (run: () => Promise<Record<string, unknown>>) => ({
  run: vi.fn(run),
  release: vi.fn(async () => undefined),
})

describe('ortBackend CPU fallback', () => {
  it('falls back to CPU when the preferred session fails to create', async () => {
    const cpu = session(async () => ({ logits: tensor([1]) }))
    const make = vi.fn(async (_p: string, providers?: string[]) => {
      if (!providers) throw new Error('webgpu unavailable')
      return { ort: fakeOrt, session: cpu }
    })
    const b = await ortBackend('m.onnx', make as never)
    expect((await b.run(new Float32Array(2))).logits?.data[0]).toBe(1)
    expect(make).toHaveBeenLastCalledWith('m.onnx', ['cpu'])
  })

  it('retries on CPU when the preferred run fails, then stays on CPU', async () => {
    const gpu = session(async () => {
      throw new Error('gpu run failed')
    })
    const cpu = session(async () => ({ logits: tensor([2]) }))
    const make = vi.fn(async (_p: string, providers?: string[]) => ({
      ort: fakeOrt,
      session: providers ? cpu : gpu,
    }))
    const b = await ortBackend('m.onnx', make as never)
    expect((await b.run(new Float32Array(2))).logits?.data[0]).toBe(2)
    await b.run(new Float32Array(2))
    expect(gpu.run).toHaveBeenCalledTimes(1)
    expect(gpu.release).toHaveBeenCalled()
    expect(cpu.run).toHaveBeenCalledTimes(2)
  })

  it('surfaces the error when CPU also fails', async () => {
    const bad = session(async () => {
      throw new Error('boom')
    })
    const make = vi.fn(async () => ({ ort: fakeOrt, session: bad }))
    const b = await ortBackend('m.onnx', make as never)
    await expect(b.run(new Float32Array(2))).rejects.toThrow('boom')
  })
})
