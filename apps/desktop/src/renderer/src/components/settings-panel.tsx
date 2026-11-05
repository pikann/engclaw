import { useEffect, useId, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Database, Mic, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { AppSettings } from '@engclaw/ipc-contract'
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ModelsPanel } from '@/components/models-panel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

const THEMES = ['system', 'light', 'dark'] as const satisfies readonly ThemePreference[]

const SECTIONS = [
  { id: 'general', icon: SlidersHorizontal, label: 'settings.general' },
  { id: 'models', icon: Mic, label: 'models.title' },
  { id: 'data', icon: Database, label: 'settings.data' },
] as const

/** A titled group of rows, rendered as a single card. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div>
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
        {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** One label + description on the left, its control on the right. */
function SettingRow({
  label,
  hint,
  labelId,
  children,
}: {
  label: string
  hint?: string
  labelId?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <div id={labelId} className="text-sm font-medium">
          {label}
        </div>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const rows =
  'divide-border border-border bg-card divide-y overflow-hidden rounded-xl border shadow-xs'

/** UI language, recording and update preferences, models, and wiping local data. */
export function SettingsPanel() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab = SECTIONS.find((s) => s.id === requested)?.id ?? SECTIONS[0].id
  const setTab = (next: string) => setParams({ tab: next }, { replace: true })
  const theme = useThemePreference()

  useEffect(() => {
    void window.engclaw.app.getSettings().then(setSettings)
  }, [])

  const toggle = async (key: keyof AppSettings, value: boolean): Promise<void> =>
    setSettings(await window.engclaw.app.updateSettings({ [key]: value }))

  const silenceId = useId()
  const updatesId = useId()

  return (
    <div data-testid="settings-panel" className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('settings.subtitle')}</p>
      </header>

      <TabsPrimitive.Root
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[11rem_minmax(0,1fr)]"
      >
        <TabsPrimitive.List
          aria-label={t('settings.nav')}
          className="flex gap-1 overflow-x-auto md:flex-col md:self-start"
        >
          {SECTIONS.map(({ id, icon: Icon, label }) => (
            <TabsPrimitive.Trigger
              key={id}
              value={id}
              data-testid={`settings-tab-${id}`}
              className="focus-visible:ring-ring/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-[3px]"
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(label)}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="general" className="min-w-0 outline-none">
          <Section title={t('settings.general')}>
            <div className={rows}>
              <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
                <LanguageSwitcher />
              </SettingRow>
              <SettingRow label={t('settings.theme')} hint={t('settings.themeHint')}>
                <div
                  role="group"
                  aria-label={t('settings.theme')}
                  className="bg-muted inline-flex rounded-lg p-0.5"
                >
                  {THEMES.map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={theme === k}
                      data-testid={`theme-${k}`}
                      onClick={() => {
                        setThemePreference(k)
                        void window.engclaw.app.updateSettings({ theme: k })
                      }}
                      className={cn(
                        'focus-visible:ring-ring/50 rounded-md px-3 py-1 text-sm font-medium outline-none focus-visible:ring-[3px]',
                        theme === k
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`settings.theme${k[0]!.toUpperCase()}${k.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </SettingRow>
              {settings && (
                <>
                  <SettingRow
                    label={t('settings.silenceAutoStop')}
                    hint={t('settings.silenceAutoStopHint')}
                    labelId={silenceId}
                  >
                    <Switch
                      data-testid="setting-silence"
                      aria-labelledby={silenceId}
                      checked={settings.silenceAutoStop}
                      onCheckedChange={(v) => void toggle('silenceAutoStop', v)}
                    />
                  </SettingRow>
                  <SettingRow
                    label={t('settings.checkForUpdates')}
                    hint={t('settings.checkForUpdatesHint')}
                    labelId={updatesId}
                  >
                    <Switch
                      data-testid="setting-updates"
                      aria-labelledby={updatesId}
                      checked={settings.checkForUpdates}
                      onCheckedChange={(v) => void toggle('checkForUpdates', v)}
                    />
                  </SettingRow>
                </>
              )}
            </div>
          </Section>
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="models" className="min-w-0 outline-none">
          <Section title={t('models.title')} hint={t('settings.modelsHint')}>
            <ModelsPanel />
          </Section>
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="data" className="min-w-0 outline-none">
          <Section title={t('settings.data')}>
            <div className={cn(rows, 'border-destructive/40')}>
              <SettingRow label={t('settings.deleteAll')} hint={t('settings.dataHint')}>
                <Button
                  variant="destructive"
                  data-testid="delete-all"
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 /> {t('settings.deleteAll')}
                </Button>
              </SettingRow>
            </div>
            {deleted && (
              <p
                role="status"
                className="text-success-soft-foreground bg-success-soft inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
                data-testid="delete-all-done"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" /> {t('settings.deleted')}
              </p>
            )}
          </Section>
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogTitle>{t('settings.deleteTitle')}</DialogTitle>
          <DialogDescription>{t('settings.deleteBody')}</DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('models.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              data-testid="delete-all-confirm"
              onClick={async () => {
                await window.engclaw.app.deleteAllData()
                setSettings(await window.engclaw.app.getSettings())
                setDeleted(true)
                setConfirming(false)
              }}
            >
              {t('settings.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
