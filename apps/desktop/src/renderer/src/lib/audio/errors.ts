export type MicErrorReason = 'denied' | 'notfound' | 'unknown'

export function classifyMicError(err: unknown): MicErrorReason {
  const name = err instanceof Error ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError')
    return 'denied'
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  )
    return 'notfound'
  return 'unknown'
}

/** i18n key for the message to show; denied access gets OS-level permission guidance. */
export function micGuidance(reason: MicErrorReason, platform: string): string {
  if (reason !== 'denied') return `audio.mic.${reason}`
  if (platform === 'darwin') return 'audio.mic.denied.macos'
  if (platform === 'win32') return 'audio.mic.denied.windows'
  return 'audio.mic.denied.generic'
}
