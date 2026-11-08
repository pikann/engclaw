import { existsSync } from 'node:fs'
import { join } from 'node:path'

const exe = process.platform === 'win32' ? 'espeak-ng.exe' : 'espeak-ng'

/**
 * Where to find `espeak-ng`. A packaged app launched from Finder/the Dock does not inherit the
 * shell PATH, so a bare `espeak-ng` is not found even when Homebrew has it installed; try the usual
 * install locations before falling back to PATH.
 */
export function resolveEspeakBinary(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath,
  exists: (p: string) => boolean = existsSync,
): string {
  if (env['ESPEAK_NG']) return env['ESPEAK_NG']
  const candidates = [
    ...(resourcesPath ? [join(resourcesPath, 'espeak-ng', exe)] : []),
    ...(process.platform === 'darwin'
      ? ['/opt/homebrew/bin/espeak-ng', '/usr/local/bin/espeak-ng']
      : []),
    ...(process.platform === 'linux' ? ['/usr/bin/espeak-ng', '/usr/local/bin/espeak-ng'] : []),
  ]
  return candidates.find((p) => exists(p)) ?? 'espeak-ng'
}
