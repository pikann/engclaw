import { useLearningLanguage } from './learning-language'
import { useCallback, useEffect, useState } from 'react'
import type { ModelProgress, ModelStatus } from '@engclaw/ipc-contract'

/** Installed-model state plus live download progress; `models` is null until the first load. */
export function useModels() {
  const language = useLearningLanguage()
  const [models, setModels] = useState<ModelStatus[] | null>(null)
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  const refresh = useCallback(() => window.engclaw.models.list().then(setModels), [])
  useEffect(() => {
    void refresh()
    return window.engclaw.models.onProgress((e) => {
      setProgress((p) => ({ ...p, [e.id]: e }))
      if (e.phase === 'ready' || e.phase === 'cancelled' || e.phase === 'error') void refresh()
      else setModels((m) => m && m.map((x) => (x.id === e.id ? { ...x, state: 'downloading' } : x)))
    })
  }, [refresh])
  return {
    models:
      models?.filter((model) =>
        language === 'zh' ? model.id === 'asr-zh' : model.id !== 'asr-zh',
      ) ?? null,
    progress,
    refresh,
  }
}
