import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  NAMESPACES,
  SUPPORTED_LOCALES,
  resolveLocale,
  resources,
} from '../packages/i18n/src'

const keys = (o: object, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`],
  )

const others = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE)

describe('i18n key parity', () => {
  for (const ns of NAMESPACES) {
    for (const lng of others) {
      it(`${lng}/${ns} has the same keys as ${DEFAULT_LOCALE}/${ns}`, () => {
        expect(keys(resources[lng][ns]).sort()).toEqual(keys(resources[DEFAULT_LOCALE][ns]).sort())
      })
    }
  }

  it('has no empty translations', () => {
    for (const lng of SUPPORTED_LOCALES)
      for (const ns of NAMESPACES)
        for (const k of keys(resources[lng][ns])) {
          const v = k
            .split('.')
            .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], resources[lng][ns])
          expect(v, `${lng}/${ns}:${k}`).not.toBe('')
        }
  })
})

describe('resolveLocale', () => {
  it('maps OS locales to supported ones, else en', () => {
    expect(resolveLocale('vi-VN')).toBe('vi')
    expect(resolveLocale('vi_VN')).toBe('vi')
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('fr-FR')).toBe('en')
    expect(resolveLocale(undefined)).toBe('en')
  })
})
