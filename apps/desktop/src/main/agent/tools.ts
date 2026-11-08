import { z } from '@engclaw/ipc-contract'
import { jsonSchema, tool, type Tool } from 'ai'

const MAX_TOOL_RESULT_CHARS = 8000

/** Gemini's OpenAI-compatible endpoint rejects `additionalProperties`; arguments are validated locally anyway. */
function stripAdditionalProperties(node: unknown): void {
  if (Array.isArray(node)) node.forEach(stripAdditionalProperties)
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>
    delete obj['additionalProperties']
    Object.values(obj).forEach(stripAdditionalProperties)
  }
}

const asContent = (value: unknown): string => {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null')
  return text.length > MAX_TOOL_RESULT_CHARS ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…` : text
}

/** A read-only capability the model may call. Arguments are untrusted and validated with `schema`. */
export function defineTool<S extends z.ZodType>(def: {
  description: string
  schema: S
  run(args: z.infer<S>, signal: AbortSignal | undefined): Promise<unknown>
}): Tool {
  const parameters = z.toJSONSchema(def.schema) as Record<string, unknown>
  delete parameters['$schema']
  stripAdditionalProperties(parameters)
  return tool({
    description: def.description,
    inputSchema: jsonSchema<z.infer<S>>(parameters, {
      validate: (value) => {
        const parsed = def.schema.safeParse(value)
        return parsed.success
          ? { success: true, value: parsed.data }
          : {
              success: false,
              error: new Error(`invalid arguments: ${z.prettifyError(parsed.error)}`),
            }
      },
    }),
    async execute(args, { abortSignal }) {
      return asContent(await def.run(args, abortSignal))
    },
  })
}
