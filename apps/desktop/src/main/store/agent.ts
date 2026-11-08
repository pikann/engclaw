import type Database from 'better-sqlite3'
import type { AgentMessage } from '@engclaw/ipc-contract'

interface Row {
  id: number
  role: 'user' | 'assistant'
  text: string
  created_at: number
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

  append(conversationId: string, role: AgentMessage['role'], text: string, now: number): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO agent_message (conversation_id, role, text, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(conversationId, role, text, now)
      this.db
        .prepare('UPDATE agent_conversation SET updated_at = ? WHERE id = ?')
        .run(now, conversationId)
    })()
  }

  messages(conversationId: string): AgentMessage[] {
    return (
      this.db
        .prepare(
          'SELECT id, role, text, created_at FROM agent_message WHERE conversation_id = ? ORDER BY id',
        )
        .all(conversationId) as Row[]
    ).map((r) => ({ id: r.id, role: r.role, text: r.text, createdAt: r.created_at }))
  }

  clear(): void {
    this.db.exec('DELETE FROM agent_message; DELETE FROM agent_conversation;')
  }
}
