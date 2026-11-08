import { BrowserWindow, net } from 'electron'
import { IPC, type AgentEvent } from '@engclaw/ipc-contract'
import { handle } from '../ipc'
import type { LlmConfigStore } from '../llm/config-store'
import type { Store } from '../store'
import { AgentService } from './service'

export function registerAgentHandlers(llm: LlmConfigStore, store: Store): AgentService {
  const emit = (e: AgentEvent): void => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.agentEvent, e)
  }
  const service = new AgentService({
    store: store.agent,
    config: () => llm.load(),
    fetchFn: (url, init) => net.fetch(url, init),
    emit,
  })
  handle(IPC.agentSend, (req) => service.send(req))
  handle(IPC.agentCancel, ({ requestId }) => {
    service.cancel(requestId)
    return null
  })
  handle(IPC.agentMessages, ({ conversationId }) => service.messages(conversationId))
  handle(IPC.agentList, () => service.conversations())
  return service
}
