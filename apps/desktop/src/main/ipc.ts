import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  invokeChannels,
  type InvokeChannel,
  type InvokeRequest,
  type InvokeResponse,
} from '@engclaw/ipc-contract'
import { isTrustedUrl } from './security-policy'

type Handler<C extends InvokeChannel> = (
  req: InvokeRequest<C>,
  event: IpcMainInvokeEvent,
) => InvokeResponse<C> | Promise<InvokeResponse<C>>

/**
 * Registers a handler for a channel declared in the contract. The sender must be our own page
 * and the payload is validated with the channel's zod schema before the handler runs.
 */
export function handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
  const schema = invokeChannels[channel]
  ipcMain.handle(channel, async (event, ...args) => {
    const url = event.senderFrame?.url ?? ''
    if (!isTrustedUrl(url, process.env['ELECTRON_RENDERER_URL']))
      throw new Error(`IPC ${channel}: untrusted sender`)
    if (args.length > 1) throw new Error(`IPC ${channel}: unexpected extra arguments`)
    const req = schema.request.parse(args[0]) as InvokeRequest<C>
    return handler(req, event)
  })
}
