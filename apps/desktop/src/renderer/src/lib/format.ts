/** Human-readable byte size, e.g. `1.26 GB`. */
export function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 2)} ${units[i]}`
}
