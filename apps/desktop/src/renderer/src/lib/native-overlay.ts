import { useEffect, useSyncExternalStore } from 'react'

/**
 * The shadowing video is a native view layered above the page, so no CSS z-index can put a
 * dialog over it. Dialogs register here while open; the player hides its view meanwhile.
 */
let open = 0
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Call from a component that is mounted only while an overlay is showing. */
export function useRegisterNativeOverlay(): void {
  useEffect(() => {
    open++
    emit()
    return () => {
      open--
      emit()
    }
  }, [])
}

/** True while any registered overlay is open. */
export function useNativeOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  )
}
