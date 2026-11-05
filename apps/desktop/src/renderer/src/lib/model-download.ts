import type { ModelProgress, ModelStatus } from '@engclaw/ipc-contract'

export interface Aggregate {
  receivedBytes: number
  totalBytes: number
  /** Whole percent, 0-100. */
  percent: number
}

/** Combined progress over the models still to download (a finished one counts in full). */
export function aggregateProgress(
  models: Pick<ModelStatus, 'id' | 'sizeBytes'>[],
  progress: Record<string, ModelProgress | undefined>,
): Aggregate {
  let receivedBytes = 0
  let totalBytes = 0
  for (const m of models) {
    const p = progress[m.id]
    totalBytes += m.sizeBytes
    receivedBytes += p
      ? Math.min(p.phase === 'ready' ? m.sizeBytes : p.receivedBytes, m.sizeBytes)
      : 0
  }
  const percent = totalBytes > 0 ? Math.min(100, Math.floor((receivedBytes / totalBytes) * 100)) : 0
  return { receivedBytes, totalBytes, percent }
}

/** Why the download cannot start in the current folder, or null when it can. */
export function spaceProblem(
  needBytes: number,
  disk: { writable: boolean; freeBytes: number } | null,
  marginBytes = 256 * 1024 * 1024,
): 'NOT_WRITABLE' | 'DISK_SPACE' | null {
  if (!disk) return null
  if (!disk.writable) return 'NOT_WRITABLE'
  return disk.freeBytes < needBytes + marginBytes ? 'DISK_SPACE' : null
}

export interface ModelCard {
  status: 'ready' | 'downloading' | 'missing'
  aggregate: Aggregate
}

/** What the Home model card shows: downloading wins over missing, which wins over ready. */
export function modelCard(
  models: Pick<ModelStatus, 'id' | 'sizeBytes' | 'state'>[],
  progress: Record<string, ModelProgress | undefined>,
): ModelCard {
  const downloading = models.filter((m) => m.state === 'downloading')
  if (downloading.length > 0)
    return { status: 'downloading', aggregate: aggregateProgress(downloading, progress) }
  const missing = models.filter((m) => m.state === 'not-installed')
  if (missing.length > 0) return { status: 'missing', aggregate: aggregateProgress(missing, {}) }
  return { status: 'ready', aggregate: aggregateProgress(models, {}) }
}
