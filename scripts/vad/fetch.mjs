/* global fetch, URL, Buffer, console */
// Fetches the Silero VAD model (MIT, see apps/desktop/resources/vad/LICENSE) that ships in the
// installer. Model weights are never committed; the pinned file is checked by SHA-256.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT = '63d4a2a7bfce8cd9bb39ed8fa0afcb5236d73e01' // v6.3
const SHA256 = '59892301a48e373121ff29ef512598b4e5ff7ebba1a461e05d490fb3c21b354b'
const NAME = 'silero_vad_16k_op15.onnx'
const URL_ = `https://raw.githubusercontent.com/snakers4/silero-vad/${COMMIT}/src/silero_vad/data/${NAME}`
const target = fileURLToPath(new URL(`../../apps/desktop/resources/vad/${NAME}`, import.meta.url))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

if (!existsSync(target) || hash(readFileSync(target)) !== SHA256) {
  const res = await fetch(URL_)
  if (!res.ok) throw new Error(`could not download ${NAME}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (hash(bytes) !== SHA256) throw new Error(`${NAME}: checksum mismatch`)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(`${target}.part`, bytes)
  renameSync(`${target}.part`, target)
  console.log(`fetched ${NAME}`)
}
