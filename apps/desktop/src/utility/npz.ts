import { inflateRawSync } from 'node:zlib'

/** Reads float32 arrays out of an `.npz` (zip of `.npy`), e.g. Kokoro's `voices-v1.0.bin`. */
export function readNpz(buf: Uint8Array): Map<string, Float32Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = buf.length - 22
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('npz: not a zip file')
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const out = new Map<string, Float32Array>()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('npz: bad central directory')
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = Buffer.from(buf.subarray(at + 46, at + 46 + nameLen)).toString('utf8')
    at += 46 + nameLen + extraLen + commentLen

    const dataStart =
      local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const raw = buf.subarray(dataStart, dataStart + size)
    if (method !== 0 && method !== 8) throw new Error(`npz: unsupported compression ${method}`)
    out.set(name.replace(/\.npy$/, ''), parseNpy(method === 8 ? inflateRawSync(raw) : raw))
  }
  return out
}

function parseNpy(npy: Uint8Array): Float32Array {
  if (npy[0] !== 0x93 || Buffer.from(npy.subarray(1, 6)).toString() !== 'NUMPY')
    throw new Error('npy: bad magic')
  const v = new DataView(npy.buffer, npy.byteOffset, npy.byteLength)
  const major = npy[6]!
  const headerLen = major === 1 ? v.getUint16(8, true) : v.getUint32(8, true)
  const start = (major === 1 ? 10 : 12) + headerLen
  const header = Buffer.from(npy.subarray(major === 1 ? 10 : 12, start)).toString('latin1')
  if (!/'descr':\s*'<f4'/.test(header)) throw new Error(`npy: only float32 supported (${header})`)
  if (/'fortran_order':\s*True/.test(header)) throw new Error('npy: fortran order unsupported')
  // Copy so the Float32Array is aligned regardless of the zip offset.
  return new Float32Array(new Uint8Array(npy.subarray(start)).buffer)
}
