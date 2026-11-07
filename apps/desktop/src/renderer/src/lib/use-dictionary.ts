import { useEffect, useState } from 'react'
import type { DictionaryRoot, DictionaryWord, WordImage } from '@engclaw/ipc-contract'

export type Loadable<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }

function useLoad<T>(id: number | null, load: (id: number) => Promise<T>): Loadable<T> | null {
  const [state, setState] = useState<{ id: number; value: Loadable<T> } | null>(null)
  useEffect(() => {
    if (id === null) return
    let live = true
    load(id).then(
      (value) => live && setState({ id, value: { status: 'ready', value } }),
      () => live && setState({ id, value: { status: 'error' } }),
    )
    return () => {
      live = false
    }
    // `load` is a stable module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (id === null) return null
  return state?.id === id ? state.value : { status: 'loading' }
}

export const useDictionaryWord = (id: number | null) =>
  useLoad<DictionaryWord | null>(id, (i) => window.engclaw.dictionary.word({ id: i }))

export const useDictionaryRoot = (id: number | null) =>
  useLoad<DictionaryRoot | null>(id, (i) => window.engclaw.dictionary.root({ id: i }))

/** Illustration for a word; null while loading, when there is none, or if the lookup failed. */
export function useWordImage(id: number): WordImage | null {
  const [state, setState] = useState<{ id: number; image: WordImage | null } | null>(null)
  useEffect(() => {
    let live = true
    window.engclaw.dictionary.image({ id }).then(
      (image) => live && setState({ id, image }),
      () => live && setState({ id, image: null }),
    )
    return () => {
      live = false
    }
  }, [id])
  return state?.id === id ? state.image : null
}
