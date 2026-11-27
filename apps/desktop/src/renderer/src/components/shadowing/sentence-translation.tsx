import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { LearningLanguage, SentenceTranslationResult } from '@engclaw/ipc-contract'
import { resolveLocale } from '@engclaw/i18n'
import { Button } from '@/components/ui/button'

const KEY = 'shadowing.translateSubtitles'
const errorMessages = {
  NO_PROVIDER: 'translation.noProvider',
  UNAUTHORIZED: 'translation.unauthorized',
  RATE_LIMIT: 'translation.rateLimit',
  TIMEOUT: 'translation.timeout',
  FAILED: 'translation.failed',
} as const

export function useShowTranslation() {
  const [show, setShow] = useState(() => localStorage.getItem(KEY) === '1')
  return [
    show,
    (enabled: boolean) => {
      localStorage.setItem(KEY, enabled ? '1' : '0')
      setShow(enabled)
    },
  ] as const
}

export function SentenceTranslation({
  text,
  source,
  enabled,
}: {
  text: string
  source: LearningLanguage
  enabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const target = resolveLocale(i18n.language)
  const key = JSON.stringify([source, target, text])
  const cache = useRef(new Map<string, Promise<SentenceTranslationResult>>())
  const [response, setResponse] = useState<{
    key: string
    result: SentenceTranslationResult
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const result = response?.key === key ? response.result : null
  const eligible = enabled && !!text.trim() && text.trim().length <= 2000

  useEffect(() => {
    if (!eligible || source === target) return
    let live = true
    const timer = window.setTimeout(() => {
      let pending = cache.current.get(key)
      if (!pending) {
        pending = window.engclaw.llm
          .translateSentence({ text, source, target })
          .catch((): SentenceTranslationResult => ({ ok: false, code: 'FAILED' }))
        if (cache.current.size >= 100) {
          const oldest = cache.current.keys().next()
          if (!oldest.done) cache.current.delete(oldest.value)
        }
        cache.current.set(key, pending)
      }
      void pending.then((result) => {
        if (!result.ok && cache.current.get(key) === pending) cache.current.delete(key)
        if (live) setResponse({ key, result })
      })
    }, 180)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [attempt, eligible, key, source, target, text])

  if (!eligible) return null
  return (
    <div
      className="max-h-20 w-full shrink-0 overflow-auto px-4 text-center text-sm"
      aria-live="polite"
    >
      {source === target ? (
        <p className="text-muted-foreground">{t('translation.sameLanguage')}</p>
      ) : result?.ok ? (
        <p
          lang={target}
          className="break-words whitespace-pre-wrap"
          data-testid="shadowing-translation"
        >
          {result.text}
        </p>
      ) : result ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span role="alert">{t(errorMessages[result.code])}</span>
          {(result.code === 'NO_PROVIDER' || result.code === 'UNAUTHORIZED') && (
            <Link className="text-primary underline" to="/settings?tab=agent">
              {t('translation.configure')}
            </Link>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setResponse(null)
              setAttempt((previous) => previous + 1)
            }}
          >
            {t('practice.retry')}
          </Button>
        </div>
      ) : (
        <p role="status" className="text-muted-foreground">
          {t('translation.loading')}
        </p>
      )}
    </div>
  )
}
