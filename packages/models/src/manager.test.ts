import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Catalog } from './catalog'
import { ModelError, ModelManager, type ProgressEvent } from './manager'

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')
const A = Buffer.alloc(3000, 'a')
const B = Buffer.alloc(2000, 'b')

const catalog = (rev = 'r1', a = A, b = B): Catalog =>
  Catalog.parse({
    models: [
      {
        id: 'phone',
        name: 'Phone',
        license: 'Apache-2.0',
        repo: 'org/phone',
        revision: rev,
        files: [
          { path: 'config.json', size: b.length, sha256: sha(b) },
          { path: 'onnx/model.onnx', size: a.length, sha256: sha(a) },
        ],
      },
    ],
  })

/** Fake HF: serves bodies by URL tail, honours Range unless `ignoreRange`. */
function server(files: Record<string, Buffer>, opts: { ignoreRange?: boolean } = {}) {
  const calls: { url: string; range?: string }[] = []
  const fail: Record<string, (Response | Error)[]> = {}
  const fetch = async (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => {
    const range = init.headers['Range']
    calls.push(range ? { url, range } : { url })
    const queued = fail[url]?.shift()
    if (queued instanceof Error) throw queued
    if (queued) return queued
    const key = decodeURIComponent(url.split('/resolve/')[1]!.split('/').slice(1).join('/'))
    const body = files[key]
    if (!body) return new Response('nope', { status: 404 })
    if (range && !opts.ignoreRange) {
      const from = Number(/bytes=(\d+)-/.exec(range)![1])
      return new Response(new Uint8Array(body.subarray(from)), { status: 206 })
    }
    return new Response(new Uint8Array(body), { status: 200 })
  }
  return { fetch, calls, fail }
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'models-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const make = (
  cat: Catalog,
  fetch: ReturnType<typeof server>['fetch'],
  events: ProgressEvent[] = [],
) =>
  new ModelManager({
    catalog: cat,
    modelsDir: () => dir,
    fetch,
    onProgress: (e) => events.push(e),
    freeSpace: async () => 10 ** 9,
    sleep: async () => {},
    progressIntervalMs: 0,
    spaceMarginBytes: 0,
  })

describe('ModelManager', () => {
  it('reports not-installed, downloads, and then is ready with no network (offline)', async () => {
    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const events: ProgressEvent[] = []
    const m = make(catalog(), s.fetch, events)
    expect((await m.status('phone')).state).toBe('not-installed')

    await m.download('phone')
    const st = await m.status('phone')
    expect(st).toMatchObject({ state: 'ready', sizeBytes: 5000, updateAvailable: false })
    expect(await readFile(join(st.path!, 'onnx/model.onnx'))).toEqual(A)
    expect(events.at(-1)).toMatchObject({ phase: 'ready', receivedBytes: 5000, totalBytes: 5000 })
    expect(events.some((e) => e.phase === 'downloading' && e.receivedBytes > 0)).toBe(true)

    // "Later launch": new manager, a fetch that must never be used.
    const offline = make(catalog(), async () => {
      throw new Error('network used')
    })
    expect((await offline.status('phone')).state).toBe('ready')
    await offline.download('phone')
  })

  it('resumes an interrupted download with a Range request', async () => {
    const stage = join(dir, 'phone', 'r1.partial', 'onnx')
    await (await import('node:fs/promises')).mkdir(stage, { recursive: true })
    await writeFile(join(stage, 'model.onnx.part'), A.subarray(0, 1200))

    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const events: ProgressEvent[] = []
    await make(catalog(), s.fetch, events).download('phone')

    expect(s.calls.find((c) => c.url.endsWith('model.onnx'))?.range).toBe('bytes=1200-')
    expect(events[0]!.receivedBytes).toBe(1200)
    expect(await readFile(join(dir, 'phone', 'r1', 'onnx', 'model.onnx'))).toEqual(A)
  })

  it('restarts the file when the server ignores Range', async () => {
    const stage = join(dir, 'phone', 'r1.partial', 'onnx')
    await (await import('node:fs/promises')).mkdir(stage, { recursive: true })
    await writeFile(join(stage, 'model.onnx.part'), A.subarray(0, 1000))
    const s = server({ 'config.json': B, 'onnx/model.onnx': A }, { ignoreRange: true })
    await make(catalog(), s.fetch).download('phone')
    expect(await readFile(join(dir, 'phone', 'r1', 'onnx', 'model.onnx'))).toEqual(A)
  })

  it('retries transient failures (network error, 503) and resumes mid-file', async () => {
    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const u = (p: string) => `https://huggingface.co/org/phone/resolve/r1/${p}`
    s.fail[u('config.json')] = [new Error('ECONNRESET'), new Response('', { status: 503 })]
    await make(catalog(), s.fetch).download('phone')
    expect(s.calls.filter((c) => c.url === u('config.json'))).toHaveLength(3)
  })

  it('gives up with NETWORK after maxAttempts, keeping partial data', async () => {
    const s = server({})
    await expect(make(catalog(), s.fetch).download('phone')).rejects.toMatchObject({
      code: 'NETWORK',
    })
    expect(existsSync(join(dir, 'phone', 'r1'))).toBe(false)
  })

  it('detects a corrupted file and re-fetches it', async () => {
    const bad = Buffer.alloc(A.length, 'x')
    const good = server({ 'config.json': B, 'onnx/model.onnx': A })
    let served = 0
    const fetch: typeof good.fetch = async (url, init) => {
      if (url.endsWith('model.onnx') && served++ === 0)
        return new Response(new Uint8Array(bad), { status: 200 })
      return good.fetch(url, init)
    }
    const events: ProgressEvent[] = []
    await make(catalog(), fetch, events).download('phone')
    expect(served).toBe(2)
    expect(await readFile(join(dir, 'phone', 'r1', 'onnx', 'model.onnx'))).toEqual(A)
  })

  it('fails with CHECKSUM when the source keeps serving corrupt data, and installs nothing', async () => {
    const bad = Buffer.alloc(A.length, 'x')
    const s = server({ 'config.json': B, 'onnx/model.onnx': bad })
    const events: ProgressEvent[] = []
    await expect(make(catalog(), s.fetch, events).download('phone')).rejects.toMatchObject({
      code: 'CHECKSUM',
    })
    expect(events.at(-1)).toMatchObject({ phase: 'error', error: 'CHECKSUM' })
    expect(existsSync(join(dir, 'phone', 'r1'))).toBe(false)
  })

  it('detects an installed file that was truncated later and reports not-installed', async () => {
    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const m = make(catalog(), s.fetch)
    await m.download('phone')
    await writeFile(join(dir, 'phone', 'r1', 'onnx', 'model.onnx'), A.subarray(0, 10))
    expect((await m.status('phone')).state).toBe('not-installed')
    await m.download('phone')
    expect((await stat(join(dir, 'phone', 'r1', 'onnx', 'model.onnx'))).size).toBe(A.length)
  })

  it('refuses to start without enough disk space', async () => {
    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const m = new ModelManager({
      catalog: catalog(),
      modelsDir: () => dir,
      fetch: s.fetch,
      freeSpace: async () => 100,
      spaceMarginBytes: 0,
    })
    await expect(m.download('phone')).rejects.toMatchObject({ code: 'DISK_SPACE' })
    expect(s.calls).toHaveLength(0)
  })

  it('cancel aborts, keeps partials, and a later download resumes', async () => {
    const good = server({ 'config.json': B, 'onnx/model.onnx': A })
    // eslint-disable-next-line prefer-const -- assigned after the fetch stub that closes over it
    let m: ModelManager
    let cancelled = false
    const fetch: typeof good.fetch = async (url, init) => {
      if (url.endsWith('model.onnx') && !cancelled) {
        cancelled = true
        m.cancel('phone')
        throw new DOMException('aborted', 'AbortError')
      }
      return good.fetch(url, init)
    }
    const events: ProgressEvent[] = []
    m = make(catalog(), fetch, events)
    await expect(m.download('phone')).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(events.at(-1)?.phase).toBe('cancelled')
    expect((await m.status('phone')).state).toBe('not-installed')
    await m.download('phone')
    expect((await m.status('phone')).state).toBe('ready')
  })

  it('rejects concurrent downloads of the same model', async () => {
    const good = server({ 'config.json': B, 'onnx/model.onnx': A })
    const m = make(catalog(), good.fetch)
    const first = m.download('phone')
    await expect(m.download('phone')).rejects.toMatchObject({ code: 'BUSY' })
    await first
  })

  it('removes a model and allows re-download', async () => {
    const s = server({ 'config.json': B, 'onnx/model.onnx': A })
    const m = make(catalog(), s.fetch)
    await m.download('phone')
    await m.remove('phone')
    expect((await m.status('phone')).state).toBe('not-installed')
    expect(existsSync(join(dir, 'phone'))).toBe(false)
    await m.download('phone')
    expect((await m.status('phone')).state).toBe('ready')
  })

  it('upgrades to a new revision, flags the update, and deletes the old revision after success', async () => {
    const s1 = server({ 'config.json': B, 'onnx/model.onnx': A })
    await make(catalog('r1'), s1.fetch).download('phone')

    const A2 = Buffer.alloc(3500, 'z')
    const s2 = server({ 'config.json': B, 'onnx/model.onnx': A2 })
    const m2 = make(catalog('r2', A2), s2.fetch)
    expect(await m2.status('phone')).toMatchObject({
      state: 'not-installed',
      installedRevision: 'r1',
      updateAvailable: true,
    })
    await m2.download('phone')
    expect(await readdir(join(dir, 'phone'))).toEqual(['r2'])
    expect(await m2.status('phone')).toMatchObject({ state: 'ready', updateAvailable: false })
  })

  it('uses the live modelsDir (custom models directory)', async () => {
    const other = await mkdtemp(join(tmpdir(), 'models-custom-'))
    try {
      let current = dir
      const s = server({ 'config.json': B, 'onnx/model.onnx': A })
      const m = new ModelManager({
        catalog: catalog(),
        modelsDir: () => current,
        fetch: s.fetch,
        freeSpace: async () => 10 ** 9,
        spaceMarginBytes: 0,
      })
      await m.download('phone')
      current = other
      expect((await m.status('phone')).state).toBe('not-installed')
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })

  it('throws UNKNOWN_MODEL for ids outside the catalog', async () => {
    const m = make(catalog(), server({}).fetch)
    await expect(m.status('nope')).rejects.toBeInstanceOf(ModelError)
    await expect(m.download('nope')).rejects.toMatchObject({ code: 'UNKNOWN_MODEL' })
  })
})

describe('Catalog', () => {
  it('rejects path traversal and bad hashes', () => {
    const base = { id: 'x', name: 'X', license: 'MIT', repo: 'a/b', revision: 'r' }
    for (const path of ['../evil', '/abs', 'a//b', 'a\\b'])
      expect(() =>
        Catalog.parse({
          models: [{ ...base, files: [{ path, size: 1, sha256: 'a'.repeat(64) }] }],
        }),
      ).toThrow()
    expect(() =>
      Catalog.parse({ models: [{ ...base, files: [{ path: 'f', size: 1, sha256: 'nothex' }] }] }),
    ).toThrow()
  })
})
