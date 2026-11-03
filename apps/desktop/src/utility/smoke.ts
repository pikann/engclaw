// Packaging smoke checks (ENGC-54): prove the native modules load from the packaged app
// and a tiny ONNX model runs in the utility process. Triggered by ENGCLAW_SMOKE=1.
import { join } from 'node:path'
import { createRequire } from 'node:module'

export interface SmokeReport {
  arch: string
  platform: string
  sqlite: { ok: boolean; detail: string }
  ort: { ok: boolean; detail: string; cpu: boolean; webgpu: string }
}

export async function runSmoke(modelPath: string): Promise<SmokeReport> {
  const req = createRequire(join(__dirname, 'utility.js'))
  const report: SmokeReport = {
    arch: process.arch,
    platform: process.platform,
    sqlite: { ok: false, detail: '' },
    ort: { ok: false, detail: '', cpu: false, webgpu: 'not attempted' },
  }
  try {
    const Database = req('better-sqlite3')
    const db = new Database(':memory:')
    db.exec('create table t(x integer); insert into t values (41)')
    const row = db.prepare('select x + 1 as y from t').get() as { y: number }
    db.close()
    report.sqlite = { ok: row.y === 42, detail: `select returned ${row.y}` }
  } catch (e) {
    report.sqlite.detail = String(e)
  }
  try {
    const ort = req('onnxruntime-node') as typeof import('onnxruntime-node')
    const feeds = {
      a: new ort.Tensor('float32', Float32Array.from([1, 2, 3]), [3]),
      b: new ort.Tensor('float32', Float32Array.from([10, 20, 30]), [3]),
    }
    const run = async (ep: string): Promise<number[]> => {
      const s = await ort.InferenceSession.create(modelPath, { executionProviders: [ep] })
      try {
        const out = await s.run(feeds)
        return Array.from(out['c']!.data as Float32Array)
      } finally {
        await s.release()
      }
    }
    const cpu = await run('cpu')
    report.ort.cpu = cpu.join() === '11,22,33'
    report.ort.detail = `cpu -> ${cpu.join()}`
    try {
      const gpu = await Promise.race([
        run('webgpu'),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 20s')), 20_000)),
      ])
      report.ort.webgpu = gpu.join() === '11,22,33' ? 'ok' : `wrong output ${gpu.join()}`
    } catch (e) {
      report.ort.webgpu = `fallback to cpu: ${String(e).slice(0, 200)}`
    }
    report.ort.ok = report.ort.cpu
  } catch (e) {
    report.ort.detail = String(e)
  }
  return report
}
