import { useEffect, useSyncExternalStore } from 'react'
import type { AppSettings } from '@engclaw/ipc-contract'

export type ThemePreference = AppSettings['theme']

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The theme actually shown for a preference and the current OS setting. */
export function resolveTheme(pref: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

/** Toggles the `.dark` class (wired to the Tailwind `dark:` variant) on <html>. */
export function applyTheme(
  pref: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  const dark = resolveTheme(pref, window.matchMedia?.(DARK_QUERY).matches ?? false) === 'dark'
  root.classList.toggle('dark', dark)
}

/** Keeps <html> in sync with the preference, and with the OS while it is `system`. */
export function useTheme(pref: ThemePreference): void {
  useEffect(() => {
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia?.(DARK_QUERY)
    if (!mq) return
    const on = (): void => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
}

let current: ThemePreference = 'system'
const listeners = new Set<() => void>()

/** Sets the preference in the UI immediately; persistence is the caller's job. */
export function setThemePreference(pref: ThemePreference): void {
  current = pref
  listeners.forEach((l) => l())
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
