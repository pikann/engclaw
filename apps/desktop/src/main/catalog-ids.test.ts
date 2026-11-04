import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, TTS_MODEL_ID } from '@engclaw/pronounce'

const ids = new Set(
  (
    JSON.parse(readFileSync(new URL('../../resources/models.json', import.meta.url), 'utf8')) as {
      models: { id: string }[]
    }
  ).models.map((m) => m.id),
)

describe('model ids used by the app exist in the bundled catalog', () => {
  it('reference voice', () => expect(ids).toContain(TTS_MODEL_ID))
  it.each(Object.values(LANGUAGES))('$code phone + asr models', (l) => {
    expect(ids).toContain(l.phoneModelId)
    expect(ids).toContain(l.asrModelId)
  })
})
