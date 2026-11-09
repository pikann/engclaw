/** Fails when an installer exceeds the size budget. Usage: bun scripts/perf/installer-size.ts [dir] */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import budgets from './budgets.json'

const INSTALLER = /\.(dmg|exe|AppImage|deb)$/

export interface SizeVerdict {
  file: string
  mb: number
  ok: boolean
}

export function checkInstallerSizes(
  files: { file: string; bytes: number }[],
  maxMB: number,
): SizeVerdict[] {
  return files
    .filter((f) => INSTALLER.test(f.file))
    .map((f) => ({ file: f.file, mb: f.bytes / 1e6, ok: f.bytes <= maxMB * 1e6 }))
}

if (process.argv[1]?.endsWith('installer-size.ts')) {
  const dir = process.argv[2] ?? 'release'
  const files = readdirSync(dir).map((file) => ({ file, bytes: statSync(join(dir, file)).size }))
  const verdicts = checkInstallerSizes(files, budgets.installerMaxMB)
  for (const v of verdicts)
    console.log(
      `${v.ok ? 'ok  ' : 'OVER'} ${v.file} ${v.mb.toFixed(1)} MB (budget ${budgets.installerMaxMB} MB)`,
    )
  if (verdicts.length === 0) {
    console.error(`no installers found in ${dir}`)
    process.exit(1)
  }
  if (verdicts.some((v) => !v.ok)) process.exit(1)
}
