export interface LicenseEntry {
  name: string
  url: string
  license: string
}

const LINE = /^- \[(.+?)\]\((https:\/\/[^)\s]+)\) - (.+)$/

/** Parses the `- [name@version](url) - license` lines of the generated THIRD_PARTY_LICENSES.md. */
export function parseLicenses(markdown: string): LicenseEntry[] {
  return markdown.split('\n').flatMap((line) => {
    const m = LINE.exec(line.trim())
    return m ? [{ name: m[1]!, url: m[2]!, license: m[3]! }] : []
  })
}
