import { describe, expect, it } from 'vitest'
import { parseLicenses } from './licenses'

describe('parseLicenses', () => {
  it('reads package, link and license from generated notice lines', () => {
    const md = [
      '- [@floating-ui/core@1.8.0](https://github.com/floating-ui/floating-ui) - MIT',
      '- [x@1.0.0](https://github.com/a/x) - (Apache-2.0 AND BSD-3-Clause)',
    ].join('\n')
    expect(parseLicenses(md)).toEqual([
      {
        name: '@floating-ui/core@1.8.0',
        url: 'https://github.com/floating-ui/floating-ui',
        license: 'MIT',
      },
      { name: 'x@1.0.0', url: 'https://github.com/a/x', license: '(Apache-2.0 AND BSD-3-Clause)' },
    ])
  })

  it('skips lines that are not entries and non-https links', () => {
    expect(parseLicenses('# heading\n\n- [a@1](http://x.test) - MIT\ntext')).toEqual([])
  })
})
