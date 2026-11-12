import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten'

/** YouTube URL transforms run without Node, filesystem or network bindings. */
export async function evaluatePlayerScript(source: string, timeoutMs = 5000): Promise<unknown> {
  const engine = await getQuickJS()
  return engine.evalCode(`(function () {\n${source}\n})()`, {
    shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + timeoutMs),
    memoryLimitBytes: 128 * 1024 * 1024,
    maxStackSizeBytes: 1024 * 1024,
  })
}
