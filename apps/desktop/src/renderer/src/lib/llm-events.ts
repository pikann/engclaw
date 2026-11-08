/** Fired on `window` after the AI provider is saved or removed, so other views can re-read its status. */
export const LLM_CHANGED_EVENT = 'engclaw:llm-changed'
export const notifyLlmChanged = () => window.dispatchEvent(new Event(LLM_CHANGED_EVENT))
