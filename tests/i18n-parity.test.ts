import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import vi from '../messages/vi.json'

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  )

describe('i18n key parity', () => {
  it('en and vi have identical keys', () => {
    expect(keys(vi).sort()).toEqual(keys(en).sort())
  })
})
