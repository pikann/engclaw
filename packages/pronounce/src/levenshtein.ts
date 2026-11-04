/** Edit distance over token sequences. */
export function levenshtein(a: readonly string[], b: readonly string[]): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ])
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
  return dp[a.length]![b.length]!
}

export type OpTag = 'equal' | 'replace' | 'insert' | 'delete'
/** Same shape as python-Levenshtein `opcodes`: `[tag, i1, i2, j1, j2]`, ranges half-open. */
export type Opcode = readonly [OpTag, number, number, number, number]

/**
 * Edit script between two token sequences, grouped into blocks like python-Levenshtein's `opcodes`.
 * Reproduces rapidfuzz's tie-breaking (common prefix/suffix trimmed, backtrace from the end preferring
 * deletion, then insertion, then match/substitution) so that alignments equal the Python reference.
 */
export function opcodes(a: readonly string[], b: readonly string[]): Opcode[] {
  let prefix = 0
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++
  let suffix = 0
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix++
  const s = a.slice(prefix, a.length - suffix)
  const t = b.slice(prefix, b.length - suffix)
  const n = s.length
  const m = t.length

  const dp = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 1; j <= m; j++) dp[0]![j] = j
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (s[i - 1] === t[j - 1] ? 0 : 1),
      )

  const ops: OpTag[] = []
  let i = n
  let j = m
  while (i > 0 && j > 0) {
    if (dp[i]![j]! - dp[i - 1]![j]! === 1) {
      ops.push('delete')
      i--
    } else {
      j--
      if (dp[i]![j]! - dp[i - 1]![j]! === -1) ops.push('insert')
      else {
        i--
        ops.push(s[i] !== t[j] ? 'replace' : 'equal')
      }
    }
  }
  while (i-- > 0) ops.push('delete')
  while (j-- > 0) ops.push('insert')
  ops.reverse()
  const all: OpTag[] = [
    ...new Array<OpTag>(prefix).fill('equal'),
    ...ops,
    ...new Array<OpTag>(suffix).fill('equal'),
  ]

  const out: Opcode[] = []
  let pi = 0
  let pj = 0
  for (let k = 0; k < all.length;) {
    const tag = all[k]!
    let e = k
    while (e < all.length && all[e] === tag) e++
    const len = e - k
    const di = tag === 'insert' ? 0 : len
    const dj = tag === 'delete' ? 0 : len
    out.push([tag, pi, pi + di, pj, pj + dj])
    pi += di
    pj += dj
    k = e
  }
  return out
}
