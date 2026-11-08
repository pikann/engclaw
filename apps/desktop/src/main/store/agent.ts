import type Database from 'better-sqlite3'
import { AgentCard, type AgentConversation, type AgentMessage } from '@engclaw/ipc-contract'

interface Row {
  id: number
  role: 'user' | 'assistant'
  text: string
  created_at: number
  cards: string
}

/** Stored cards are re-validated on read; anything that no longer fits the schema is dropped. */
function parseCards(json: string): AgentCard[] {
  try {
    const raw: unknown = JSON.parse(json)
    if (!Array.isArray(raw)) return []
    return raw.flatMap((c) => {
      const r = AgentCard.safeParse(c)
      return r.success ? [r.data] : []
    })
  } catch {
    return []
  }
}

/** Agent conversations: user and assistant turns, oldest first. */
export class AgentStore {
  constructor(private readonly db: Database.Database) {}

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM agent_conversation WHERE id = ?').get(id) !== undefined
  }

  create(id: string, now: number): void {
    this.db
      .prepare('INSERT INTO agent_conversation (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(id, now, now)
  }

  append(
    conversationId: string,
    role: AgentMessage['role'],
    text: string,
    now: number,
    cards: readonly AgentCard[] = [],
  ): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO agent_message (conversation_id, role, text, created_at, cards) VALUES (?, ?, ?, ?, ?)',
        )
        .run(conversationId, role, text, now, JSON.stringify(cards))
      this.db
        .prepare('UPDATE agent_conversation SET updated_at = ? WHERE id = ?')
        .run(now, conversationId)
    })()
  }

  messages(conversationId: string): AgentMessage[] {
    return (
      this.db
        .prepare(
          'SELECT id, role, text, created_at, cards FROM agent_message WHERE conversation_id = ? ORDER BY id',
        )
        .all(conversationId) as Row[]
    ).map((r) => ({
      id: r.id,
      role: r.role,
      text: r.text,
      createdAt: r.created_at,
      cards: parseCards(r.cards),
    }))
  }

  list(): AgentConversation[] {
    return (
      this.db
        .prepare(
          `SELECT c.id, c.updated_at,
                  (SELECT text FROM agent_message m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.id LIMIT 1) AS first
           FROM agent_conversation c
           WHERE EXISTS (SELECT 1 FROM agent_message m WHERE m.conversation_id = c.id)
           ORDER BY c.updated_at DESC, c.rowid DESC`,
        )
        .all() as { id: string; updated_at: number; first: string | null }[]
    ).map((r) => ({
      id: r.id,
      title: (r.first ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      updatedAt: r.updated_at,
    }))
  }

  clear(): void {
    this.db.exec('DELETE FROM agent_message; DELETE FROM agent_conversation;')
  }
}
