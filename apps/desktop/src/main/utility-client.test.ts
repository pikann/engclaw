import { describe, expect, it } from 'vitest'
import { RpcFailure, UtilityClient, type UtilityLike } from './utility-client'

class FakeChild implements UtilityLike {
  sent: { type: string; id: number; method?: string }[] = []
  private handlers: Record<string, ((a: unknown) => void)[]> = {}
  postMessage(m: unknown) {
    this.sent.push(m as FakeChild['sent'][number])
  }
  on(event: string, cb: (a: unknown) => void) {
    ;(this.handlers[event] ??= []).push(cb)
  }
  emit(event: string, arg: unknown) {
    for (const h of this.handlers[event] ?? []) h(arg)
  }
}

function setup() {
  const children: FakeChild[] = []
  const client = new UtilityClient(() => {
    const c = new FakeChild()
    children.push(c)
    return c
  })
  return { client, children }
}

describe('UtilityClient', () => {
  it('spawns lazily, correlates results and forwards progress', async () => {
    const { client, children } = setup()
    expect(children).toHaveLength(0)
    const stages: string[] = []
    const { id, result } = client.call(
      'analyze',
      { text: 'hi' },
      { onProgress: (s) => stages.push(s) },
    )
    children[0]!.emit('message', { type: 'rpc-progress', id, stage: 'scoring' })
    children[0]!.emit('message', { type: 'rpc-result', id, ok: true, value: { score: 90 } })
    await expect(result).resolves.toEqual({ score: 90 })
    expect(stages).toEqual(['scoring'])
    expect(children[0]!.sent[0]).toMatchObject({ type: 'rpc', id, method: 'analyze' })
  })

  it('maps error results to RpcFailure with the model id', async () => {
    const { client, children } = setup()
    const { id, result } = client.call('analyze', {})
    children[0]!.emit('message', {
      type: 'rpc-result',
      id,
      ok: false,
      code: 'MODEL_MISSING',
      message: 'm',
      modelId: 'phone',
    })
    await expect(result).rejects.toMatchObject({ code: 'MODEL_MISSING', modelId: 'phone' })
    await expect(result).rejects.toBeInstanceOf(RpcFailure)
  })

  it('fails in-flight calls when the process crashes and recovers on the next call', async () => {
    const { client, children } = setup()
    const first = client.call('analyze', {})
    children[0]!.emit('exit', 139)
    await expect(first.result).rejects.toMatchObject({ code: 'PROCESS_CRASHED' })

    const second = client.call('analyze', {})
    expect(children).toHaveLength(2)
    children[1]!.emit('message', { type: 'rpc-result', id: second.id, ok: true, value: 1 })
    await expect(second.result).resolves.toBe(1)
  })

  it('a late exit of an old process does not fail calls on the new one', async () => {
    const { client, children } = setup()
    client.call('analyze', {}).result.catch(() => undefined)
    children[0]!.emit('exit', 1)
    const next = client.call('analyze', {})
    children[0]!.emit('exit', 1)
    children[1]!.emit('message', { type: 'rpc-result', id: next.id, ok: true, value: 'ok' })
    await expect(next.result).resolves.toBe('ok')
  })

  it('sends cancel only for calls still pending, and on abort', () => {
    const { client, children } = setup()
    const ac = new AbortController()
    const { id } = client.call('analyze', {}, { signal: ac.signal })
    ac.abort()
    expect(children[0]!.sent.at(-1)).toEqual({ type: 'rpc-cancel', id })
    client.cancel(999)
    expect(children[0]!.sent).toHaveLength(2)
  })
})
