import { pinyin } from 'pinyin-pro'
import { describe, expect, it } from 'vitest'
import { MANDARIN_FINALS, mandarinFinal } from './mandarin-final'
import { finalTips, mandarinGuide, vietnameseFinals } from './mandarin-pronunciation'

describe('Standalone Mandarin finals', () => {
  it('provides a listenable example and Vietnamese guidance for every supported final', () => {
    expect(Object.keys(finalTips).sort()).toEqual([...MANDARIN_FINALS].sort())
    expect(Object.keys(vietnameseFinals).sort()).toEqual([...MANDARIN_FINALS].sort())
    for (const final of MANDARIN_FINALS) {
      const item = mandarinFinal(final)!
      expect(item.final).toBe(final)
      expect(pinyin(item.han), final).toBe(item.reading)
      expect(mandarinGuide(item.reading), final).toHaveLength(1)
    }
  })

  it('recognizes full spellings and keyboard aliases', () => {
    expect(mandarinFinal(' IANG ')?.reading).toBe('yāng')
    expect(mandarinFinal('iou')?.final).toBe('iu')
    expect(mandarinFinal('uei')?.final).toBe('ui')
    expect(mandarinFinal('uen')?.final).toBe('un')
    expect(mandarinFinal('u:an')?.final).toBe('üan')
    expect(mandarinFinal('vn')?.final).toBe('ün')
    expect(mandarinFinal('xiāng')).toBeNull()
  })
})
