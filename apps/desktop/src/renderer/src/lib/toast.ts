import { useSyncExternalStore } from 'react'

/** Minimal app-wide toast: one message at a time, auto-dismissed. */
let current: { id: number; message: string } | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function showToast(message: string, ms = 10000): void {
  current = { id: ++seq, message }
  clearTimeout(timer)
  timer = setTimeout(dismissToast, ms)
  emit()
}
export function dismissToast(): void {
  current = null
  clearTimeout(timer)
  emit()
}
export function useToast() {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
    () => null,
  )
}
