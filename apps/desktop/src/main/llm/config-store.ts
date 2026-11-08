import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { LlmStoredConfig, type LlmProviderStatus } from '@engclaw/ipc-contract'
import type { ProviderConfig } from './provider'

/** The OS-keychain-backed cipher (Electron `safeStorage`), injected so this module stays testable. */
export interface Cipher {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(blob: Buffer): string
}

type Envelope = { v: 1; blob: string } | { v: 2; config: unknown }

/**
 * The whole provider config (URL, model, key, header values) is one encrypted blob on disk, so no
 * secret is ever written in the clear. Only a config with no key and no headers (a local server)
 * may be stored unencrypted, and only when the OS cannot encrypt.
 */
export class LlmConfigStore {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  get secureStorage(): boolean {
    return this.cipher.available()
  }

  load(): ProviderConfig | null {
    try {
      const env = JSON.parse(readFileSync(this.file, 'utf8')) as Envelope
      const raw: unknown =
        env.v === 1
          ? JSON.parse(this.cipher.decrypt(Buffer.from(env.blob, 'base64')))
          : env.v === 2
            ? env.config
            : null
      const parsed = LlmStoredConfig.safeParse(raw)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  save(cfg: ProviderConfig): void {
    const secret = cfg.apiKey !== '' || cfg.headers.length > 0
    if (!this.cipher.available() && secret) throw new Error('secure storage unavailable')
    const env: Envelope = this.cipher.available()
      ? { v: 1, blob: this.cipher.encrypt(JSON.stringify(cfg)).toString('base64') }
      : { v: 2, config: cfg }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(env), { mode: 0o600 })
  }

  clear(): void {
    rmSync(this.file, { force: true })
  }

  status(): LlmProviderStatus {
    const cfg = this.load()
    return {
      kind: cfg ? 'openai-compatible' : 'none',
      baseUrl: cfg?.baseUrl ?? null,
      model: cfg?.model ?? null,
      hasApiKey: cfg !== null && cfg.apiKey !== '',
      headerNames: cfg?.headers.map((h) => h.name) ?? [],
      secureStorage: this.secureStorage,
    }
  }
}
