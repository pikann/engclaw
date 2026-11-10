import { describe, expect, it } from 'vitest'
import {
  buildCsp,
  isAllowedExternalUrl,
  isPermissionAllowed,
  isPlayerFrameUrlAllowed,
  isTrustedUrl,
} from './security-policy'

const FEEDBACK_URL = 'https://github.com/pikann/engclaw/issues/new/choose'

describe('isAllowedExternalUrl', () => {
  it.each(['https://example.com/a?b=1', 'https://youtube.com/watch?v=x', FEEDBACK_URL])(
    'allows %s',
    (u) => expect(isAllowedExternalUrl(u)).toBe(true),
  )
  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'app://engclaw/',
    'ms-msdt:/id',
    'https://user:pw@example.com',
    'not a url',
    '',
  ])('rejects %s', (u) => expect(isAllowedExternalUrl(u)).toBe(false))
})

describe('isTrustedUrl', () => {
  it('accepts the app origin', () => {
    expect(isTrustedUrl('app://engclaw/')).toBe(true)
    expect(isTrustedUrl('app://engclaw/assets/x.js')).toBe(true)
  })
  it('rejects look-alikes and foreign origins', () => {
    for (const u of ['app://engclaw.evil.com/', 'https://engclaw/', 'file:///x', 'about:blank', ''])
      expect(isTrustedUrl(u)).toBe(false)
  })
  it('accepts the dev server origin only when configured', () => {
    expect(isTrustedUrl('http://localhost:5173/')).toBe(false)
    expect(isTrustedUrl('http://localhost:5173/x', 'http://localhost:5173/')).toBe(true)
    expect(isTrustedUrl('http://localhost:9999/x', 'http://localhost:5173/')).toBe(false)
  })
})

describe('isPermissionAllowed', () => {
  it('allows the microphone for our origin only', () => {
    expect(isPermissionAllowed('media', 'app://engclaw/')).toBe(true)
    expect(isPermissionAllowed('media', 'https://evil.com/')).toBe(false)
  })
  it.each(['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal', 'fullscreen'])(
    'denies %s',
    (p) => expect(isPermissionAllowed(p, 'app://engclaw/')).toBe(false),
  )
})

describe('buildCsp', () => {
  it('is strict in production', () => {
    const csp = buildCsp(false)
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/unsafe-eval/)
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).not.toContain('localhost')
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
  it('never allows unsafe-eval, even in dev', () => {
    expect(buildCsp(true)).not.toMatch(/unsafe-eval/)
  })
})

describe('isPlayerFrameUrlAllowed', () => {
  const origin = 'http://127.0.0.1:4321'
  it.each([
    'http://127.0.0.1:4321/player.html?v=dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('allows %s', (u) => expect(isPlayerFrameUrlAllowed(u, origin)).toBe(true))
  it.each([
    'http://127.0.0.1:9999/player.html',
    'http://localhost:4321/player.html',
    'https://evil.example.com/',
    'https://www.youtube.com.evil.example.com/embed/x',
    'http://www.youtube.com/embed/x',
    'file:///etc/passwd',
    'app://engclaw/',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (u) => expect(isPlayerFrameUrlAllowed(u, origin)).toBe(false))
})
