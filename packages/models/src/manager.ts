import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { freeSpaceOf } from './dir'
import { fileUrl, totalSize, type Catalog, type CatalogFile, type CatalogModel } from './catalog'

export type ModelErrorCode =
  'UNKNOWN_MODEL' | 'BUSY' | 'DISK_SPACE' | 'NETWORK' | 'CHECKSUM' | 'CANCELLED'

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string = code,
  ) {
    super(message)
  }
}

export type ModelState = 'not-installed' | 'downloading' | 'ready'

export interface ModelStatus {
  id: string
  name: string
  license: string
  revision: string
  /** Bytes to download for the pinned revision. */
  sizeBytes: number
  state: ModelState
  /** Any other revision already on disk (candidate for an upgrade). */
  installedRevision: string | null
  updateAvailable: boolean
  /** Folder of the ready model, null unless `state === 'ready'`. */
  path: string | null
}

export type ProgressPhase = 'downloading' | 'verifying' | 'ready' | 'error' | 'cancelled'

export interface ProgressEvent {
  id: string
  phase: ProgressPhase
  receivedBytes: number
  totalBytes: number
  error?: ModelErrorCode
}

export interface ModelManagerDeps {
  catalog: Catalog
  /** Resolved on every call so a changed "custom models dir" takes effect immediately. */
  modelsDir: () => string
  fetch: (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => Promise<Response>
  onProgress?: (e: ProgressEvent) => void
  /** Free bytes on the volume holding `dir`. */
  freeSpace?: (dir: string) => Promise<number>
  /** Back-off between retries; `attempt` starts at 1. */
  sleep?: (attempt: number) => Promise<void>
  maxAttempts?: number
  /** Extra headroom required beyond the download size. */
  spaceMarginBytes?: number
  progressIntervalMs?: number
}

/** Headroom required beyond the download size. */
export const SPACE_MARGIN_BYTES = 256 * 1024 * 1024
const MANIFEST = '.engclaw-model.json'
const PARTIAL_SUFFIX = '.partial'

const defaultSleep = (attempt: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** (attempt - 1))))

const sizeOf = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

const sha256File = (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')))
  })

/**
 * Downloads, verifies and installs models into `<modelsDir>/<id>/<revision>/`.
 * Pure Node (no Electron) so it is unit-testable; the main process injects fetch/paths.
 */
export class ModelManager {
  private readonly active = new Map<string, AbortController>()
  private readonly maxAttempts: number
  private readonly sleep: (attempt: number) => Promise<void>
  private readonly freeSpace: (dir: string) => Promise<number>

  constructor(private readonly deps: ModelManagerDeps) {
    this.maxAttempts = deps.maxAttempts ?? 4
    this.sleep = deps.sleep ?? defaultSleep
    this.freeSpace = deps.freeSpace ?? freeSpaceOf
  }

  private model(id: string): CatalogModel {
    const m = this.deps.catalog.models.find((x) => x.id === id)
    if (!m) throw new ModelError('UNKNOWN_MODEL', `unknown model ${id}`)
    return m
  }

  private dir(m: CatalogModel, revision = m.revision): string {
    return join(this.deps.modelsDir(), m.id, revision)
  }

  /** Offline check: manifest present and every file has its expected size. */
  private async isInstalled(m: CatalogModel, revision: string): Promise<boolean> {
    const root = this.dir(m, revision)
    try {
      const manifest = JSON.parse(await readFile(join(root, MANIFEST), 'utf8')) as {
        files?: CatalogFile[]
      }
      if (!Array.isArray(manifest.files) || manifest.files.length === 0) return false
      for (const f of manifest.files)
        if ((await sizeOf(join(root, f.path))) !== f.size) return false
      return true
    } catch {
      return false
    }
  }

  private async otherRevisions(m: CatalogModel): Promise<string[]> {
    try {
      const names = await readdir(join(this.deps.modelsDir(), m.id))
      return names.filter((n) => n !== m.revision && !n.endsWith(PARTIAL_SUFFIX))
    } catch {
      return []
    }
  }

  async status(id: string): Promise<ModelStatus> {
    const m = this.model(id)
    const ready = await this.isInstalled(m, m.revision)
    let installedRevision: string | null = ready ? m.revision : null
    if (!ready)
      for (const rev of await this.otherRevisions(m))
        if (await this.isInstalled(m, rev)) installedRevision = rev
    return {
      id: m.id,
      name: m.name,
      license: m.license,
      revision: m.revision,
      sizeBytes: totalSize(m),
      state: this.active.has(id) ? 'downloading' : ready ? 'ready' : 'not-installed',
      installedRevision,
      updateAvailable: !ready && installedRevision !== null,
      path: ready ? this.dir(m) : null,
    }
  }

  list(): Promise<ModelStatus[]> {
    return Promise.all(this.deps.catalog.models.map((m) => this.status(m.id)))
  }

  /** Resolves when the model is installed (immediately if it already is). */
  async download(id: string): Promise<void> {
    const m = this.model(id)
    if (this.active.has(id)) throw new ModelError('BUSY', `${id} is already downloading`)
    const ctl = new AbortController()
    this.active.set(id, ctl)
    const total = totalSize(m)
    let received = 0
    try {
      if (await this.isInstalled(m, m.revision)) {
        this.emit({ id, phase: 'ready', receivedBytes: total, totalBytes: total })
        return
      }
      received = await this.run(m, ctl.signal)
      this.emit({ id, phase: 'ready', receivedBytes: total, totalBytes: total })
    } catch (e) {
      const code: ModelErrorCode =
        ctl.signal.aborted || (e instanceof ModelError && e.code === 'CANCELLED')
          ? 'CANCELLED'
          : e instanceof ModelError
            ? e.code
            : 'NETWORK'
      this.emit({
        id,
        phase: code === 'CANCELLED' ? 'cancelled' : 'error',
        receivedBytes: received,
        totalBytes: total,
        ...(code === 'CANCELLED' ? {} : { error: code }),
      })
      throw e instanceof ModelError ? e : new ModelError(code, String(e))
    } finally {
      this.active.delete(id)
    }
  }

  /** Aborts a running download; partial files are kept so the next download resumes. */
  cancel(id: string): void {
    this.active.get(id)?.abort()
  }

  /** Deletes every revision and any partial data of the model. */
  async remove(id: string): Promise<void> {
    const m = this.model(id)
    this.cancel(id)
    await rm(join(this.deps.modelsDir(), m.id), { recursive: true, force: true })
  }

  private emit(e: ProgressEvent): void {
    this.deps.onProgress?.(e)
  }

  private async run(m: CatalogModel, signal: AbortSignal): Promise<number> {
    const total = totalSize(m)
    const stage = this.dir(m) + PARTIAL_SUFFIX
    await mkdir(stage, { recursive: true })

    // Count what is already on disk (resume) so progress does not restart at zero.
    const got = new Map<string, number>()
    for (const f of m.files)
      got.set(
        f.path,
        Math.min(
          f.size,
          (await sizeOf(join(stage, f.path + '.part'))) || (await sizeOf(join(stage, f.path))),
        ),
      )
    const sum = (): number => [...got.values()].reduce((a, b) => a + b, 0)

    const need = total - sum()
    const free = await this.freeSpace(stage)
    if (free < need + (this.deps.spaceMarginBytes ?? SPACE_MARGIN_BYTES))
      throw new ModelError('DISK_SPACE', `need ${need} bytes, ${free} free`)

    let last = 0
    const interval = this.deps.progressIntervalMs ?? 100
    const tick = (force = false): void => {
      const now = Date.now()
      if (!force && now - last < interval) return
      last = now
      this.emit({ id: m.id, phase: 'downloading', receivedBytes: sum(), totalBytes: total })
    }
    tick(true)

    for (const f of m.files) {
      await this.fetchFile(m, f, stage, signal, (n) => {
        got.set(f.path, n)
        tick()
      })
      got.set(f.path, f.size)
    }
    tick(true)

    this.emit({ id: m.id, phase: 'verifying', receivedBytes: total, totalBytes: total })
    await writeFile(
      join(stage, MANIFEST),
      JSON.stringify({ id: m.id, revision: m.revision, files: m.files }, null, 2),
    )
    // Atomic install: the final folder only ever appears fully verified.
    const final = this.dir(m)
    await rm(final, { recursive: true, force: true })
    await rename(stage, final)
    for (const rev of await this.otherRevisions(m))
      await rm(this.dir(m, rev), { recursive: true, force: true })
    return total
  }

  private async fetchFile(
    m: CatalogModel,
    f: CatalogFile,
    stage: string,
    signal: AbortSignal,
    onBytes: (n: number) => void,
  ): Promise<void> {
    const final = join(stage, f.path)
    const part = final + '.part'
    await mkdir(dirname(final), { recursive: true })

    if ((await sizeOf(final)) === f.size && (await sha256File(final)) === f.sha256) return
    await rm(final, { force: true })

    let lastError: ModelError = new ModelError('NETWORK')
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      if (signal.aborted) throw new ModelError('CANCELLED')
      if (attempt > 1) {
        await this.sleep(attempt - 1)
        if (signal.aborted) throw new ModelError('CANCELLED')
      }
      try {
        let have = await sizeOf(part)
        if (have > f.size) {
          await rm(part, { force: true })
          have = 0
        }
        if (have < f.size) await this.transfer(m, f, part, have, signal, onBytes)
        if ((await sizeOf(part)) !== f.size) throw new ModelError('NETWORK', 'truncated download')
        if ((await sha256File(part)) !== f.sha256) {
          await rm(part, { force: true })
          onBytes(0)
          throw new ModelError('CHECKSUM', `${f.path}: sha256 mismatch`)
        }
        await rename(part, final)
        return
      } catch (e) {
        if (signal.aborted) throw new ModelError('CANCELLED')
        if (!(e instanceof ModelError)) lastError = new ModelError('NETWORK', String(e))
        else if (e.code === 'NETWORK' || e.code === 'CHECKSUM') lastError = e
        else throw e
      }
    }
    throw lastError
  }

  private async transfer(
    m: CatalogModel,
    f: CatalogFile,
    part: string,
    have: number,
    signal: AbortSignal,
    onBytes: (n: number) => void,
  ): Promise<void> {
    const headers: Record<string, string> = have > 0 ? { Range: `bytes=${have}-` } : {}
    const res = await this.deps.fetch(fileUrl(m, f), { headers, signal })
    if (res.status === 416) {
      await rm(part, { force: true })
      throw new ModelError('NETWORK', 'range not satisfiable, restarting')
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => undefined)
      throw new ModelError('NETWORK', `HTTP ${res.status}`)
    }
    // 200 means the server ignored Range: start the file over.
    const resumed = res.status === 206 && have > 0
    let written = resumed ? have : 0
    const fh = await open(part, resumed ? 'a' : 'w')
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        await fh.write(chunk)
        written += chunk.byteLength
        onBytes(Math.min(written, f.size))
      }
    } finally {
      await fh.close()
    }
  }
}
