import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { startPlayerServer, type PlayerServer } from './player-server'

let server: PlayerServer | undefined
afterEach(async () => {
  await server?.close()
  server = undefined
})

function get(
  path: string,
  opts: { host?: string; method?: string } = {},
): Promise<{
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}> {
  const s = server!
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: s.port,
        path,
        method: opts.method ?? 'GET',
        headers: { Host: opts.host ?? `127.0.0.1:${s.port}` },
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('player server', () => {
  it('listens on loopback only, on an ephemeral port', async () => {
    server = await startPlayerServer()
    expect(server.origin).toBe(`http://127.0.0.1:${server.port}`)
    expect(server.port).toBeGreaterThan(0)
    expect(server.address()).toBe('127.0.0.1')
  })

  it('serves the player page and script', async () => {
    server = await startPlayerServer()
    const page = await get('/player.html?v=dQw4w9WgXcQ')
    expect(page.status).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect(page.body).toContain('<script src="/player.js"></script>')
    const script = await get('/player.js')
    expect(script.status).toBe(200)
    expect(script.headers['content-type']).toContain('javascript')
    expect(script.body).toContain('onYouTubeIframeAPIReady')
  })

  it('sends a restrictive CSP that only allows YouTube for scripts and frames', async () => {
    server = await startPlayerServer()
    const { headers } = await get('/player.html?v=dQw4w9WgXcQ')
    const csp = String(headers['content-security-policy'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self' https://www.youtube.com")
    expect(csp).toContain('frame-src https://www.youtube.com')
    expect(csp).not.toContain("'unsafe-eval'")
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  it('serves nothing else', async () => {
    server = await startPlayerServer()
    for (const path of ['/', '/etc/passwd', '/../secret', '/player.html/../x', '/package.json'])
      expect((await get(path)).status).toBe(404)
  })

  it('rejects a missing or malformed video id', async () => {
    server = await startPlayerServer()
    expect((await get('/player.html')).status).toBe(400)
    expect((await get('/player.html?v=short')).status).toBe(400)
    expect((await get('/player.html?v=%3Cscript%3Ealert(1)')).status).toBe(400)
    expect((await get('/player.html?v=dQw4w9WgXcQ%22x')).status).toBe(400)
  })

  it('only answers GET', async () => {
    server = await startPlayerServer()
    expect((await get('/player.js', { method: 'POST' })).status).toBe(405)
  })

  it('refuses requests whose Host is not our loopback origin (DNS rebinding)', async () => {
    server = await startPlayerServer()
    expect((await get('/player.js', { host: 'evil.example.com' })).status).toBe(403)
    expect((await get('/player.js', { host: `localhost:${server.port}` })).status).toBe(403)
  })

  it('stops listening after close', async () => {
    server = await startPlayerServer()
    const port = server.port
    await server.close()
    server = undefined
    await expect(
      new Promise((resolve, reject) => {
        const req = request({ host: '127.0.0.1', port, path: '/player.js' }, resolve)
        req.on('error', reject)
        req.end()
      }),
    ).rejects.toThrow()
  })
})
