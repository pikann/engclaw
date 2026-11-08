/** Release notes / CHANGELOG entry from conventional commits. Usage: bun scripts/changelog/notes.ts <tag> [prevTag] */
import { execFileSync } from 'node:child_process'

const SECTIONS: [type: string, title: string][] = [
  ['feat', 'Features'],
  ['fix', 'Bug fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
]

const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/

export function renderNotes(version: string, subjects: string[]): string {
  const groups = new Map<string, string[]>()
  const breaking: string[] = []
  for (const subject of subjects) {
    const m = HEADER.exec(subject.trim())
    if (!m) continue
    const [, type = '', scope, bang, text = ''] = m
    const line = scope ? `**${scope}:** ${text}` : text
    if (bang) breaking.push(line)
    if (!SECTIONS.some(([t]) => t === type)) continue
    groups.set(type, [...(groups.get(type) ?? []), line])
  }
  const out = [`## ${version}`]
  if (breaking.length) out.push('', '### Breaking changes', ...breaking.map((l) => `- ${l}`))
  for (const [type, title] of SECTIONS) {
    const lines = groups.get(type)
    if (lines) out.push('', `### ${title}`, ...lines.map((l) => `- ${l}`))
  }
  if (out.length === 1) out.push('', 'No user-facing changes.')
  return out.join('\n') + '\n'
}

if (import.meta.main) {
  const [tag, prevArg] = process.argv.slice(2)
  if (!tag) throw new Error('usage: notes.ts <tag> [prevTag]')
  const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const prev = prevArg ?? git('describe', '--tags', '--abbrev=0', `${tag}^`)
  const subjects = git('log', `${prev}..${tag}`, '--no-merges', '--format=%s').split('\n')
  process.stdout.write(renderNotes(tag.replace(/^v/, ''), subjects))
}
