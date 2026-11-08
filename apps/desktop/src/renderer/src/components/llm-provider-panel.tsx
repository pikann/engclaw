import { notifyLlmChanged } from '@/lib/llm-events'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import type { LlmErrorCode, LlmHeader, LlmProviderStatus } from '@engclaw/ipc-contract'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AdvancedFields,
  ConnectionTestStatus,
  FormField,
  ProviderInput,
  type ConnectionStatus,
} from '@/components/ui/provider-form'

const PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
] as const

/** `Name: value` per line; returns the 1-based number of the first bad line otherwise. */
export function parseHeaderLines(text: string): { headers: LlmHeader[] } | { badLine: number } {
  const headers: LlmHeader[] = []
  const lines = text.split('\n')
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim()
    if (line === '') continue
    const at = line.indexOf(':')
    if (at < 1) return { badLine: i + 1 }
    headers.push({ name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() })
  }
  return { headers }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Configure, test and remove the OpenAI-compatible provider. Secrets are write-only from here. */
export function LlmProviderPanel() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<LlmProviderStatus | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [headersText, setHeadersText] = useState('')
  const [headersTouched, setHeadersTouched] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [conn, setConn] = useState<ConnectionStatus>('idle')
  const [detail, setDetail] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  const listId = useId()

  useEffect(() => {
    void window.engclaw.llm.status().then((s) => {
      setStatus(s)
      setBaseUrl(s.baseUrl ?? '')
      setModel(s.model ?? '')
    })
  }, [])

  const errorText = (code: LlmErrorCode): string => t(`settings.llm.error.${code}`)

  const draft = ():
    { baseUrl: string; apiKey?: string; headers?: LlmHeader[] } | { error: string } => {
    const out: { baseUrl: string; apiKey?: string; headers?: LlmHeader[] } = { baseUrl }
    if (apiKey !== '') out.apiKey = apiKey
    if (headersTouched) {
      const parsed = parseHeaderLines(headersText)
      if ('badLine' in parsed)
        return { error: t('settings.llm.badHeader', { line: parsed.badLine }) }
      out.headers = parsed.headers
    }
    return out
  }

  const test = async (): Promise<void> => {
    const d = draft()
    setMessage(undefined)
    if ('error' in d) {
      setConn('failed')
      setDetail(d.error)
      return
    }
    setConn('testing')
    setDetail(undefined)
    const res = await window.engclaw.llm.test({ ...d, ...(model.trim() ? { model } : {}) })
    if (!res.ok) {
      setConn('failed')
      setDetail(errorText(res.code))
      return
    }
    setModels(res.models)
    setConn('ok')
    setDetail(
      res.modelFound === false
        ? t('settings.llm.modelMissing', { model: model.trim() })
        : t('settings.llm.modelCount', { count: res.models.length }),
    )
  }

  const save = async (): Promise<void> => {
    const d = draft()
    setMessage(undefined)
    if ('error' in d) {
      setConn('failed')
      setDetail(d.error)
      return
    }
    setBusy(true)
    const res = await window.engclaw.llm.save({ ...d, model })
    setBusy(false)
    if (!res.ok) {
      setConn('failed')
      setDetail(errorText(res.code))
      return
    }
    setStatus(res.status)
    notifyLlmChanged()
    setBaseUrl(res.status.baseUrl ?? '')
    setApiKey('')
    setHeadersText('')
    setHeadersTouched(false)
    setConn('idle')
    setMessage(t('settings.llm.saved'))
  }

  const remove = async (): Promise<void> => {
    setStatus(await window.engclaw.llm.remove())
    notifyLlmChanged()
    setBaseUrl('')
    setModel('')
    setApiKey('')
    setHeadersText('')
    setHeadersTouched(false)
    setModels([])
    setConn('idle')
    setMessage(t('settings.llm.removed'))
  }

  const configured = status !== null && status.kind !== 'none'

  return (
    <div data-testid="llm-provider-panel" className="space-y-5">
      <p className="text-muted-foreground text-sm">{t('settings.llm.intro')}</p>
      <div className="border-border bg-card space-y-4 rounded-xl border p-4 shadow-xs">
        <div>
          <h3 className="text-sm font-semibold">{t('settings.llm.advancedTitle')}</h3>
          <p className="text-muted-foreground text-xs">{t('settings.llm.advancedHint')}</p>
        </div>
        <p className="text-sm" aria-live="polite" data-testid="llm-active">
          {configured && status.model && status.baseUrl
            ? t('settings.llm.active', { model: status.model, host: hostOf(status.baseUrl) })
            : t('settings.llm.none')}
        </p>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t('settings.llm.presets')}
        >
          {PRESETS.map((p) => (
            <Button key={p.name} variant="outline" size="sm" onClick={() => setBaseUrl(p.baseUrl)}>
              {p.name}
            </Button>
          ))}
        </div>

        <FormField label={t('settings.llm.baseUrl')} hint={t('settings.llm.baseUrlHint')}>
          {(props) => (
            <ProviderInput
              {...props}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
              autoComplete="off"
            />
          )}
        </FormField>

        <FormField
          label={t('settings.llm.apiKey')}
          hint={status?.hasApiKey ? t('settings.llm.apiKeySaved') : t('settings.llm.apiKeyHint')}
        >
          {(props) => (
            <div className="flex gap-2">
              <ProviderInput
                {...props}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t('settings.llm.showKey')}
                aria-pressed={showKey}
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          )}
        </FormField>

        <FormField label={t('settings.llm.model')} hint={t('settings.llm.modelHint')}>
          {(props) => (
            <>
              <ProviderInput
                {...props}
                list={listId}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <datalist id={listId}>
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </FormField>

        <AdvancedFields>
          <FormField
            label={t('settings.llm.extraHeaders')}
            hint={
              status && status.headerNames.length > 0
                ? `${t('settings.llm.extraHeadersHint')} ${t('settings.llm.extraHeadersCurrent', { names: status.headerNames.join(', ') })}`
                : t('settings.llm.extraHeadersHint')
            }
          >
            {(props) => (
              <Textarea
                {...props}
                value={headersText}
                onChange={(e) => {
                  setHeadersText(e.target.value)
                  setHeadersTouched(true)
                }}
                rows={3}
                spellCheck={false}
                placeholder="HTTP-Referer: https://example.com"
              />
            )}
          </FormField>
        </AdvancedFields>

        <ConnectionTestStatus status={conn} detail={detail} />
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void test()} disabled={baseUrl.trim() === ''}>
            {t('settings.llm.test')}
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || baseUrl.trim() === '' || model.trim() === ''}
          >
            {t('settings.llm.save')}
          </Button>
          {configured && (
            <Button variant="ghost" onClick={() => void remove()}>
              {t('settings.llm.remove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
