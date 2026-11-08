import { z } from '@engclaw/ipc-contract'
import type { ToolSpec } from './types'

/** Read-only capabilities the model may call. Arguments are untrusted and validated with `schema`. */
export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string
  description: string
  schema: S
  run(args: z.infer<S>, signal: AbortSignal): Promise<unknown>
}

export const defineTool = <S extends z.ZodType>(tool: AgentTool<S>): AgentTool => tool as AgentTool

/** Gemini's OpenAI-compatible endpoint rejects `additionalProperties`; arguments are re-validated locally anyway. */
function stripAdditionalProperties(node: unknown): void {
  if (Array.isArray(node)) node.forEach(stripAdditionalProperties)
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    delete obj['additionalProperties']
    Object.values(obj).forEach(stripAdditionalProperties)
  }
}

export function toolSpecs(tools: readonly AgentTool[]): ToolSpec[] {
  return tools.map((t) => {
    const parameters = z.toJSONSchema(t.schema) as Record<string, unknown>
    delete parameters['$schema']
    stripAdditionalProperties(parameters)
    return { name: t.name, description: t.description, parameters }
  })
}
