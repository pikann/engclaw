import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { readNpz } from './npz'

function npy(values: number[]): Buffer {
  const header = Buffer.from(
    `{'descr': '<f4', 'fortran_order': False, 'shape': (${values.length},), }`.padEnd(117, ' ') +
      '\n',
  )
  const head = Buffer.alloc(10)
  head.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0])
  head.writeUInt16LE(header.length, 8)
  return Buffer.concat([head, header, Buffer.from(Float32Array.from(values).buffer)])
}

function zip(entries: { name: string; data: Buffer; deflate?: boolean }[]): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const body = e.deflate ? deflateRawSync(e.data) : e.data
    const name = Buffer.from(e.name)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(e.deflate ? 8 : 0, 8)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(e.data.length, 22)
    lh.writeUInt16LE(name.length, 26)
    locals.push(lh, name, body)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(e.deflate ? 8 : 0, 10)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(e.data.length, 24)
    ch.writeUInt16LE(name.length, 28)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

describe('readNpz', () => {
  it('reads stored and deflated float32 arrays by name', () => {
    const file = zip([
      { name: 'af_heart.npy', data: npy([1, 2, 3]) },
      { name: 'am_michael.npy', data: npy([4.5, -5]), deflate: true },
    ])
    const voices = readNpz(file)
    expect(Array.from(voices.get('af_heart')!)).toEqual([1, 2, 3])
    expect(Array.from(voices.get('am_michael')!)).toEqual([4.5, -5])
  })

  it('rejects non-zip input', () => {
    expect(() => readNpz(Buffer.alloc(40))).toThrow('not a zip')
  })
})
