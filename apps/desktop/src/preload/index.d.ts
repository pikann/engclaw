import type { EngclawApi } from '@engclaw/ipc-contract'

declare global {
  interface Window {
    engclaw: EngclawApi
  }
}
