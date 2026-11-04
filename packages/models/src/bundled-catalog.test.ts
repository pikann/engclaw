import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Catalog, fileUrl } from './catalog'

const catalog = Catalog.parse(
  JSON.parse(
    readFileSync(new URL('../../../apps/desktop/resources/models.json', import.meta.url), 'utf8'),
  ),
)

describe('bundled models.json', () => {
  it('pins every model to a full git SHA', () => {
    for (const m of catalog.models) expect(m.revision, m.id).toMatch(/^[0-9a-f]{40}$/)
  })

  it('lists no quantized variants (D19: fp32 only)', () => {
    for (const m of catalog.models)
      for (const f of m.files) expect(f.path, `${m.id}/${f.path}`).not.toMatch(/model_\w+\.onnx$/)
  })

  it('has unique model ids and pinned download URLs', () => {
    expect(new Set(catalog.models.map((m) => m.id)).size).toBe(catalog.models.length)
    const m = catalog.models[0]!
    expect(fileUrl(m, m.files[0]!)).toBe(
      `https://huggingface.co/${m.repo}/resolve/${m.revision}/${m.files[0]!.path}`,
    )
  })
})
