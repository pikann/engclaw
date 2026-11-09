/**
 * Manual per-OS measurement of the fixed wav2vec2 models (needs the downloaded model folders).
 * Usage: bun scripts/perf/measure-inference.ts <asr-model-dir> [phone-model-dir]
 * Prints load time, 5 s and 60 s clip times, and RSS after load / after unload, and compares them with
 * scripts/perf/budgets.json. Record the numbers in the Packaging doc's performance checklist.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { loadModelAdapter, type Backend } from '../../apps/desktop/src/utility/model-adapter'
import budgets from './budgets.json'

const require = createRequire(import.meta.url)
const ort = require(
  require.resolve('onnxruntime-node', { paths: [join(__dirname, '../../apps/desktop')] }),
)

const backend = async (onnxPath: string): Promise<Backend> => {
  const session = await ort.InferenceSession.create(onnxPath, {
    executionProviders: ['webgpu', 'cpu'],
  })
  return {
    async run(input) {
      const out = await session.run({
        input_values: new ort.Tensor('float32', input, [1, input.length]),
      })
      return Object.fromEntries(
        Object.entries(out as Record<string, { data: Float32Array; dims: number[] }>).map(
          ([k, t]) => [k, { data: t.data, dims: t.dims }],
        ),
      )
    },
    dispose: () => session.release(),
  }
}

const rssMB = () => Math.round(process.memoryUsage().rss / 1e6)
const noise = (seconds: number) =>
  Float32Array.from(
    { length: seconds * 16000 },
    (_, i) => Math.sin(i / 20) * 0.1 + (Math.random() - 0.5) * 0.01,
  )
const time = async <T>(f: () => Promise<T>) => {
  const t = performance.now()
  const v = await f()
  return [v, Math.round(performance.now() - t)] as const
}

const dirs = process.argv.slice(2)
if (dirs.length === 0) {
  console.error('usage: bun scripts/perf/measure-inference.ts <model-dir> [more-model-dirs]')
  process.exit(2)
}

const rows: string[] = []
let failed = false
const check = (label: string, value: number, max: number | null, unit: string) => {
  const over = max !== null && value > max
  failed ||= over
  rows.push(
    `${over ? 'OVER' : 'ok  '} ${label}: ${value} ${unit}${max !== null ? ` (budget ${max})` : ''}`,
  )
}

check('rss before load', rssMB(), null, 'MB')
const adapters = []
for (const dir of dirs) {
  const [a, ms] = await time(() => loadModelAdapter(dir, backend))
  adapters.push(a)
  check(`load ${dir}`, ms, null, 'ms')
}
check('rss with models loaded', rssMB(), null, 'MB')
const first = adapters[0]!
await first.run(noise(1))
const [, ms5] = await time(() => first.run(noise(5)))
check('5 s clip', ms5, budgets.clip5sEndToEndMaxMs, 'ms')
const [, ms60] = await time(() => first.run(noise(60)))
check('60 s clip (chunked)', ms60, null, 'ms')
check('rss peak after 60 s clip', rssMB(), null, 'MB')
await Promise.all(adapters.map((a) => a.dispose()))
adapters.length = 0
globalThis.gc?.()
await new Promise((r) => setTimeout(r, 2000))
check('rss after unload', rssMB(), budgets.utilityIdleRssMaxMB, 'MB')

console.log(rows.join('\n'))
process.exit(failed ? 1 : 0)
