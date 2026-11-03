// bun run run.ts <out.json> <f32 raw @22050>...   (ffmpeg -f f32le -ac 1 -ar 22050)
import { readFileSync, writeFileSync } from 'node:fs'
import { pyin, rms } from '../src/index'

const [outPath, ...files] = process.argv.slice(2)
const out: Record<string, unknown> = {}
for (const p of files) {
  const buf = readFileSync(p)
  const y = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const t0 = performance.now()
  const r = pyin(y, { sampleRate: 22050 })
  const ms = performance.now() - t0
  out[p.split('/').pop()!.replace('.f32', '.wav')] = {
    f0: Array.from(r.f0, (v) => (Number.isNaN(v) ? null : v)),
    voiced: Array.from(r.voicedFlag),
    vprob: Array.from(r.voicedProb),
    rms: Array.from(rms(y)),
    ms,
    seconds: y.length / 22050,
  }
}
writeFileSync(outPath!, JSON.stringify(out))
