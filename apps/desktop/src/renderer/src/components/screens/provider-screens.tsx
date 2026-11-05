import { AlertTriangle, CheckCircle2, Eye, Loader2, LogOut, ShieldCheck, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AppShell, Pane, layoutOf } from '@/components/screens/shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  ConnectionTestStatus,
  FormField,
  SignInButton,
  type ConnectionStatus,
} from '@/components/ui/provider-form'
import { cn } from '@/lib/utils'

export type ProviderStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'expired' | 'error' | 'api'

/** Status chip: icon + text, never colour alone. */
export function ProviderStatusChip({ status }: { status: ProviderStatus }) {
  const { t } = useTranslation()
  const tone =
    status === 'signed-in' || status === 'api'
      ? 'bg-success-soft text-success-soft-foreground'
      : status === 'signing-in'
        ? 'bg-info-soft text-info-soft-foreground'
        : status === 'expired'
          ? 'bg-warning-soft text-warning-soft-foreground'
          : status === 'error'
            ? 'bg-destructive-soft text-destructive-soft-foreground'
            : 'bg-muted text-muted-foreground'
  const Icon =
    status === 'signed-in' || status === 'api'
      ? CheckCircle2
      : status === 'signing-in'
        ? Loader2
        : status === 'signed-out'
          ? UserX
          : AlertTriangle
  return (
    <span
      data-testid="provider-status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-3.5', status === 'signing-in' && 'animate-spin')}
      />
      {t(`screens.provider.status.${status}`)}
    </span>
  )
}

/** The default (ChatGPT) path: sign-in button and its state-specific message and action. */
function RecommendedColumn({ status }: { status: ProviderStatus }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('screens.provider.recommended')}
      </h4>
      {(status === 'signed-out' || status === 'api') && (
        <SignInButton provider="ChatGPT" onClick={() => undefined} />
      )}
      {status === 'signing-in' && (
        <div className="space-y-3" role="status">
          <SignInButton provider="ChatGPT" onClick={() => undefined} busy />
          <p className="text-muted-foreground text-sm">{t('screens.provider.signingInHint')}</p>
          <Button variant="outline" size="sm">
            {t('models.cancel')}
          </Button>
        </div>
      )}
      {status === 'signed-in' && (
        <div className="space-y-3">
          <ProviderStatusChip status="signed-in" />
          <p className="text-sm">
            {t('screens.provider.signedInAs', { account: 'hai@example.com' })}
          </p>
          <Button variant="outline" size="sm">
            <LogOut />
            {t('screens.provider.signOut')}
          </Button>
        </div>
      )}
      {status === 'expired' && (
        <div className="space-y-3">
          <p className="bg-warning-soft text-warning-soft-foreground rounded-md p-3 text-sm">
            {t('screens.provider.expiredBody')}
          </p>
          <SignInButton provider="ChatGPT" onClick={() => undefined} />
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-3">
          <p
            className="bg-destructive-soft text-destructive-soft-foreground flex gap-2 rounded-md p-3 text-sm"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('screens.provider.errorBody')}
          </p>
          <Button>{t('practice.retry')}</Button>
        </div>
      )}
      {status !== 'signed-in' && status !== 'error' && (
        <p className="text-muted-foreground text-sm">{t('screens.provider.chatgptHint')}</p>
      )}
    </div>
  )
}

/** The OpenAI-compatible form, expanded, with the connection test result. */
function AdvancedColumn({ test, configured }: { test: ConnectionStatus; configured: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('screens.provider.advancedTitle')}
      </h4>
      <FormField label={t('screens.provider.baseUrl')}>
        {(p) => <Input {...p} readOnly defaultValue="https://api.openai.com/v1" />}
      </FormField>
      <FormField
        label={t('screens.provider.apiKey')}
        error={test === 'failed' ? t('screens.provider.keyRejected') : undefined}
      >
        {(p) => (
          <div className="flex gap-2">
            <Input
              {...p}
              readOnly
              type="password"
              defaultValue={configured || test !== 'idle' ? 'sk-demo-key-0000' : ''}
            />
            <Button variant="outline" size="icon" aria-label={t('screens.provider.showKey')}>
              <Eye />
            </Button>
          </div>
        )}
      </FormField>
      <FormField label={t('screens.provider.model')}>
        {(p) => <Input {...p} readOnly defaultValue="gpt-4o-mini" />}
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" disabled={test === 'testing'}>
          {t('screens.provider.test')}
        </Button>
        <ConnectionTestStatus status={test} detail={test === 'failed' ? '401' : undefined} />
      </div>
    </div>
  )
}

/**
 * First-use provider dialog (IA doc §6): fixed 640 px, the default path left and the advanced form
 * right. Static here so every state can be shown at once.
 */
export function ProviderSetupPanel({
  status,
  test = 'idle',
}: {
  status: ProviderStatus
  test?: ConnectionStatus
}) {
  const { t } = useTranslation()
  return (
    <section
      aria-labelledby={`prov-title-${status}-${test}`}
      className="bg-card w-[640px] max-w-full space-y-4 rounded-xl border p-6 shadow-lg"
      data-testid="screen-provider"
    >
      <header className="space-y-1">
        <h3 id={`prov-title-${status}-${test}`} className="text-lg font-semibold">
          {t('screens.provider.title')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('screens.provider.intro')}</p>
      </header>
      <div className="grid grid-cols-2 gap-6 border-y py-4">
        <RecommendedColumn status={status} />
        <AdvancedColumn test={test} configured={status === 'api'} />
      </div>
      <footer className="flex justify-end gap-2">
        <Button variant="outline">{t('models.dl.notNow')}</Button>
        <Button disabled={status !== 'api' && test !== 'ok'}>{t('screens.provider.save')}</Button>
      </footer>
    </section>
  )
}

/** The dialog over the dimmed screen that opened it (Converse with no provider). */
export function ProviderOverlayScreen({
  width,
  status,
  test,
}: {
  width: number
  status: ProviderStatus
  test?: ConnectionStatus
}) {
  const { t } = useTranslation()
  return (
    <div className="relative h-full">
      <AppShell layout={layoutOf(width)} active="converse" title={t('screens.shell.converse')}>
        <div className="h-full" />
      </AppShell>
      <div className="bg-background/70 absolute inset-0 flex items-center justify-center p-4 backdrop-blur-[1px]">
        <ProviderSetupPanel status={status} test={test} />
      </div>
    </div>
  )
}

const SETTINGS_NAV = ['general', 'models', 'provider', 'privacy', 'about'] as const

/** Settings → AI provider: active provider card on the left, "what is sent" and advanced on the right. */
export function SettingsProviderScreen({
  width,
  status,
  test = 'idle',
}: {
  width: number
  status: ProviderStatus
  test?: ConnectionStatus
}) {
  const { t } = useTranslation()
  const layout = layoutOf(width)
  const stacked = layout === 'compact'
  const name = status === 'api' ? 'OpenAI-compatible' : 'ChatGPT'
  return (
    <AppShell layout={layout} active="settings" title={t('screens.shell.settings')}>
      <div className="grid h-full grid-cols-[200px_1fr] divide-x">
        <nav aria-label={t('screens.settings.nav')} className="space-y-1 p-3">
          {SETTINGS_NAV.map((k) => (
            <div
              key={k}
              aria-current={k === 'provider' ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                k === 'provider' ? 'bg-primary-soft font-medium' : 'text-muted-foreground',
              )}
            >
              {t(`screens.settings.${k}`)}
            </div>
          ))}
        </nav>
        <Pane title={t('screens.settings.provider')}>
          <div className={cn('grid gap-4', stacked ? 'grid-cols-1' : 'grid-cols-2')}>
            <Card data-testid="settings-provider-card">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  {t('screens.settings.active')}
                  <ProviderStatusChip status={status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{t('screens.settings.providerName')}</dt>
                  <dd>{status === 'signed-out' ? '—' : name}</dd>
                  <dt className="text-muted-foreground">{t('screens.provider.model')}</dt>
                  <dd className="font-mono">{status === 'signed-out' ? '—' : 'gpt-4o-mini'}</dd>
                </dl>
                {status === 'expired' && (
                  <p className="bg-warning-soft text-warning-soft-foreground rounded-md p-3">
                    {t('screens.provider.expiredBody')}
                  </p>
                )}
                {status === 'error' && (
                  <p
                    className="bg-destructive-soft text-destructive-soft-foreground rounded-md p-3"
                    role="alert"
                  >
                    {t('screens.provider.errorBody')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {status === 'signed-in' || status === 'api' ? (
                    <Button variant="outline" size="sm">
                      <LogOut />
                      {t(status === 'api' ? 'screens.provider.remove' : 'screens.provider.signOut')}
                    </Button>
                  ) : status === 'error' ? (
                    <Button size="sm">{t('practice.retry')}</Button>
                  ) : (
                    <SignInButton
                      provider="ChatGPT"
                      onClick={() => undefined}
                      busy={status === 'signing-in'}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="text-primary size-4" aria-hidden="true" />
                    {t('screens.settings.sentTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground space-y-1 text-sm">
                  <p>{t('screens.settings.sent')}</p>
                  <p>{t('screens.settings.notSent')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <AdvancedColumn test={test} configured={status === 'api'} />
                </CardContent>
              </Card>
            </div>
          </div>
        </Pane>
      </div>
    </AppShell>
  )
}
