import type { AgentErrorCode } from '@engclaw/ipc-contract'

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    readonly detail?: string,
  ) {
    super(code)
  }
}
