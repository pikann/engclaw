import { z } from 'zod'

export const PingRequest = z.object({ message: z.string().max(200) })
export const PingResponse = z.object({ echo: z.string(), platform: z.string() })

export type PingRequest = z.infer<typeof PingRequest>
export type PingResponse = z.infer<typeof PingResponse>

export const IPC = { ping: 'app:ping' } as const

export interface EngclawApi {
  ping(req: PingRequest): Promise<PingResponse>
}
