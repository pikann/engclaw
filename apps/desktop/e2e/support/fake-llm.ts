import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A scriptable stand-in for an OpenAI-compatible chat provider (`/v1/chat/completions` streaming
 * and `/v1/models`), listening on a loopback port. Each request takes the next queued scenario;
 * once the queue is empty it answers with `fallback`. Every request is recorded so a spec can
 * assert on what the app actually sent (history, system prompt, speech analysis, headers).
 */
export type Scenario =
  /** A normal streamed reply, optionally slow or split into small chunks. */
  | { kind: 'reply'; text: string; chunk?: number; chunkDelayMs?: number; startDelayMs?: number }
  /** An HTTP error with an OpenAI-style body (or a raw string/none). */
  | {
      kind: 'status'
      status: number
      message?: string
      body?: string
      headers?: Record<string, string>
    }
  /** 200 + event-stream whose data frames are not JSON. */
  | { kind: 'garbage' }
  /** 200 + a non-streaming HTML page (a proxy login wall, say). */
  | { kind: 'html' }
  /** A well-formed stream that never contains any text. */
  | { kind: 'empty' }
  /** Some text, then the connection drops mid-stream. */
  | { kind: 'truncated'; text: string }
  /** Optionally some text, then stalls until the client gives up. */
  | { kind: 'hang'; text?: string }
  /** Asks for tool calls (the next request is expected to carry their results). */
  | { kind: 'tools'; calls: { name: string; args: unknown }[] }
  /** 302 to another URL; the app refuses to follow redirects. */
  | { kind: 'redirect'; to?: string }

export interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string | string[] | undefined>
  body: {
    model?: string
    stream?: boolean
    messages: { role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }[]
    tools?: { function: { name: string } }[]
  } | null
}

const sse = (data: unknown): string => `data: ${JSON.stringify(data)}\n\n`
const delta = (content: string) => sse({ choices: [{ index: 0, delta: { content } }] })
const finish = (reason: string) =>
  sse({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class FakeLlm {
  readonly requests: RecordedRequest[] = []
  /** Chat requests whose client went away before the server finished (cancel / abort). */
  aborted = 0
  models = ['mock', 'mock-large']
  /** Answer for `GET /models`: HTTP status (default 200). */
  modelsStatus = 200
  /** When set, `GET /models` answers 302 to this URL instead. */
  modelsRedirectTo: string | null = null
  fallback: Scenario = { kind: 'reply', text: 'That sounds great. What did you build today?' }
  private queue: Scenario[] = []
  private server: Server | null = null
  private sockets = new Set<ServerResponse>()
  baseUrl = ''

  static async start(): Promise<FakeLlm> {
    const llm = new FakeLlm()
    llm.server = createServer((req, res) => void llm.handle(req, res))
    await new Promise<void>((r) => llm.server!.listen(0, '127.0.0.1', r))
    llm.baseUrl = `http://127.0.0.1:${(llm.server.address() as AddressInfo).port}/v1`
    return llm
  }

  /** Queues scenarios for the next chat requests, in order. */
  enqueue(...s: Scenario[]): this {
    this.queue.push(...s)
    return this
  }

  reset(): void {
    this.queue = []
    this.requests.length = 0
    this.aborted = 0
    this.modelsStatus = 200
    this.modelsRedirectTo = null
    for (const r of this.sockets) r.destroy()
    this.sockets.clear()
  }

  get chats(): RecordedRequest[] {
    return this.requests.filter((r) => r.path.endsWith('/chat/completions'))
  }

  /** Text of the user messages only (the system prompt mentions the analysis block itself). */
  static userText(r: RecordedRequest): string {
    return (r.body?.messages ?? [])
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n')
  }

  /** Text of every message of one chat request, flattened for `toContain` checks. */
  static textOf(r: RecordedRequest): string {
    return (r.body?.messages ?? [])
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
      .join('\n')
  }

  async stop(): Promise<void> {
    for (const r of this.sockets) r.destroy()
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    const body = ((): RecordedRequest['body'] => {
      try {
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    })()
    const path = (req.url ?? '').split('?')[0]!
    this.requests.push({ method: req.method ?? '', path, headers: req.headers, body })

    if (req.method === 'GET' && path.endsWith('/models')) {
      if (this.modelsRedirectTo) {
        res.writeHead(302, { Location: this.modelsRedirectTo })
        return void res.end()
      }
      if (this.modelsStatus !== 200) {
        res.writeHead(this.modelsStatus, { 'Content-Type': 'application/json' })
        return void res.end(JSON.stringify({ error: { message: 'nope' } }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return void res.end(JSON.stringify({ data: this.models.map((id) => ({ id })) }))
    }
    if (req.method !== 'POST' || !path.endsWith('/chat/completions')) {
      res.writeHead(404)
      return void res.end()
    }

    this.sockets.add(res)
    let done = false
    res.on('close', () => {
      this.sockets.delete(res)
      if (!done) this.aborted++
    })
    await this.respond(this.queue.shift() ?? this.fallback, res)
    done = true
  }

  private async respond(s: Scenario, res: ServerResponse): Promise<void> {
    const stream = () => res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    switch (s.kind) {
      case 'reply': {
        if (s.startDelayMs) await sleep(s.startDelayMs)
        stream()
        const size = s.chunk ?? 0
        const parts =
          size > 0 ? (s.text.match(new RegExp(`.{1,${size}}`, 'gs')) ?? []) : s.text.split(/(?<= )/)
        for (const p of parts) {
          if (res.destroyed) return
          res.write(delta(p))
          if (s.chunkDelayMs) await sleep(s.chunkDelayMs)
        }
        res.write(finish('stop'))
        return void res.end('data: [DONE]\n\n')
      }
      case 'status':
        res.writeHead(s.status, { 'Content-Type': 'application/json', ...s.headers })
        return void res.end(
          s.body ?? JSON.stringify({ error: { message: s.message ?? `HTTP ${s.status}` } }),
        )
      case 'garbage':
        stream()
        res.write('data: {not json}\n\n')
        return void res.end('data: [DONE]\n\n')
      case 'html':
        res.writeHead(200, { 'Content-Type': 'text/html' })
        return void res.end('<html><body>Please sign in to the proxy</body></html>')
      case 'empty':
        stream()
        res.write(finish('stop'))
        return void res.end('data: [DONE]\n\n')
      case 'truncated':
        stream()
        res.write(delta(s.text))
        await sleep(50)
        return void res.destroy()
      case 'hang':
        stream()
        if (s.text) res.write(delta(s.text))
        // never ends on its own; resolves when the client aborts
        return void (await new Promise<void>((r) => res.on('close', () => r())))
      case 'tools':
        stream()
        s.calls.forEach((c, i) =>
          res.write(
            sse({
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index: i,
                        id: `call_${i}`,
                        type: 'function',
                        function: { name: c.name, arguments: JSON.stringify(c.args) },
                      },
                    ],
                  },
                },
              ],
            }),
          ),
        )
        res.write(finish('tool_calls'))
        return void res.end('data: [DONE]\n\n')
      case 'redirect':
        res.writeHead(302, { Location: s.to ?? 'http://127.0.0.1:1/elsewhere' })
        return void res.end()
    }
  }
}
