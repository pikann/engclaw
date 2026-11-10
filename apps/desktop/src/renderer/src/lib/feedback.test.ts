import { describe, expect, it } from 'vitest'
import type { AppEnvironment } from '@engclaw/ipc-contract'
import { isAllowedExternalUrl } from '../../../main/security-policy'
import { buildFeedbackLink, MAX_URL_LENGTH, routeOf, sanitize } from './feedback'

const env: AppEnvironment = {
  appVersion: '1.2.3',
  platform: 'darwin',
  osVersion: '25.0.0',
  arch: 'arm64',
  electronVersion: '40.0.0',
  executionProviders: ['webgpu', 'cpu'],
}
const input = (error: string) => ({ error, route: '/shadowing', locale: 'vi', env })
const bodyOf = (url: string) => new URL(url).searchParams.get('logs') ?? ''
const param = (url: string, k: string) => new URL(url).searchParams.get(k)

describe('buildFeedbackLink', () => {
  it('targets the bug_report template and is accepted by the allow-list', () => {
    const { url } = buildFeedbackLink(input('Boom'))
    expect(
      url.startsWith('https://github.com/pikann/engclaw/issues/new?template=bug_report.yml&'),
    ).toBe(true)
    expect(isAllowedExternalUrl(url)).toBe(true)
  })
  it('encodes title and body and includes every environment field', () => {
    const { url, truncated } = buildFeedbackLink(input('Bad & "weird" #1\nline2'))
    const u = new URL(url)
    expect(u.searchParams.get('title')).toBe('Bug: Bad & "weird" #1')
    // Issue forms are prefilled by field id, not `body`.
    expect(u.searchParams.has('body')).toBe(false)
    expect(param(url, 'version')).toBe('1.2.3')
    expect(param(url, 'os')).toBe('macOS')
    expect(param(url, 'what')).toContain('Bad & "weird" #1')
    const body = bodyOf(url)
    expect(body).toContain('line2')
    for (const s of ['/shadowing', 'macOS 25.0.0 (arm64)', '40.0.0', 'webgpu > cpu', 'vi'])
      expect(body).toContain(s)
    expect(truncated).toBe(false)
  })
  it('replaces home directories with ~ and strips secrets and YouTube links', () => {
    const err =
      'ENOENT /Users/alice/Library/x.js C:\\Users\\Bob\\a.js /home/carol/b ' +
      'https://www.youtube.com/watch?v=abc token=abcd1234 Bearer abcdefghijkl'
    const { url } = buildFeedbackLink(input(err))
    const b = bodyOf(url)
    expect(b).toContain('~/Library/x.js')
    for (const s of ['alice', 'Bob', 'carol', 'youtube.com', 'abcd1234', 'abcdefghijkl'])
      expect(b).not.toContain(s)
  })
  it('truncates long stacks, keeps the URL under the limit and returns the full text', () => {
    const stack = Array.from({ length: 400 }, (_, i) => `    at fn${i} (file.js:${i}:1)`).join('\n')
    const { url, truncated, fullText } = buildFeedbackLink(input(`Error: x\n${stack}`))
    expect(truncated).toBe(true)
    expect(url.length).toBeLessThanOrEqual(MAX_URL_LENGTH)
    expect(bodyOf(url)).toContain('[truncated]')
    expect(fullText).toContain('fn399')
  })
})

describe('sanitize / routeOf', () => {
  it('sanitizes home paths only', () => {
    expect(sanitize('/Users/me/a and /usr/lib/b')).toBe('~/a and /usr/lib/b')
  })
  it('drops query and chapter number from the route', () => {
    expect(routeOf('#/game/chapter/3?x=1')).toBe('/game/chapter/:order')
    expect(routeOf('')).toBe('/')
  })
})
