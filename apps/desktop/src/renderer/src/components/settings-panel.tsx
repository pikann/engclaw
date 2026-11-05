import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings } from '@engclaw/ipc-contract'
import { setThemePreference, useThemePreference, type ThemePreference } from '@/lib/theme'
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

/** UI language, recording and update preferences, models, and wiping local data. */
export function SettingsPanel() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const theme = useThemePreference()

  useEffect(() => {
    void window.engclaw.app.getSettings().then(setSettings)
  }, [])

  const toggle = async (key: keyof AppSettings, value: boolean): Promise<void> =>
    setSettings(await window.engclaw.app.updateSettings({ [key]: value }))

  return (
    <div className="space-y-4" data-testid="settings-panel">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
        <LanguageSwitcher />
        <div role="group" aria-label={t('settings.theme')} className="flex items-center gap-2">
          <span className="text-sm">{t('settings.theme')}</span>
          {(['system', 'light', 'dark'] as const satisfies readonly ThemePreference[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={theme === k ? 'default' : 'outline'}
              aria-pressed={theme === k}
              data-testid={`theme-${k}`}
              onClick={() => {
                setThemePreference(k)
                void window.engclaw.app.updateSettings({ theme: k })
              }}
            >
              {t(`settings.theme${k[0]!.toUpperCase()}${k.slice(1)}`)}
            </Button>
          ))}
        </div>
        {settings && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="setting-silence"
                checked={settings.silenceAutoStop}
                onChange={(e) => void toggle('silenceAutoStop', e.target.checked)}
              />
              {t('settings.silenceAutoStop')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="setting-updates"
                checked={settings.checkForUpdates}
                onChange={(e) => void toggle('checkForUpdates', e.target.checked)}
              />
              {t('settings.checkForUpdates')}
            </label>
          </>
        )}
      </section>

      <ModelsPanel />

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{t('settings.data')}</h2>
        <p className="text-muted-foreground text-sm">{t('settings.dataHint')}</p>
        <Button variant="destructive" data-testid="delete-all" onClick={() => setConfirming(true)}>
          {t('settings.deleteAll')}
        </Button>
        {deleted && (
          <p role="status" className="text-sm" data-testid="delete-all-done">
            {t('settings.deleted')}
          </p>
        )}
      </section>

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
