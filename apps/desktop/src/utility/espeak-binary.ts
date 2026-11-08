import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const exe = process.platform === 'win32' ? 'espeak-ng.exe' : 'espeak-ng'

export interface EspeakLocation {
  binary: string
  /** Folder that contains `espeak-ng-data` (espeak-ng's `--path`), when it is not the default. */
  dataPath?: string
}

/**
 * Where to find `espeak-ng`: `ESPEAK_NG`, the copy bundled in the app (`resources/espeak-ng/`, built
 * by scripts/espeak/build.sh), then the usual install locations, then PATH. A packaged app launched
 * from Finder does not inherit the shell PATH, so a bare name is not enough for a Homebrew install.
 */
export function resolveEspeak(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath,
  exists: (p: string) => boolean = existsSync,
): EspeakLocation {
  const dataPath = env['ESPEAK_DATA_PATH'] || undefined
  if (env['ESPEAK_NG']) return { binary: env['ESPEAK_NG'], dataPath }
  if (resourcesPath) {
    const bundled = join(resourcesPath, 'espeak-ng', exe)
    if (exists(bundled)) return { binary: bundled, dataPath: dataPath ?? dirname(bundled) }
  }
  const system = [
    ...(process.platform === 'darwin'
      ? ['/opt/homebrew/bin/espeak-ng', '/usr/local/bin/espeak-ng']
      : []),
    ...(process.platform === 'linux' ? ['/usr/bin/espeak-ng', '/usr/local/bin/espeak-ng'] : []),
  ].find((p) => exists(p))
  return { binary: system ?? 'espeak-ng', dataPath }
}
