import { useTranslation } from 'react-i18next'

const DESTINATIONS = ['hf', 'youtube', 'github', 'wikimedia', 'llm'] as const

/** What stays on the device and the only network destinations the app contacts. */
export function PrivacyPanel() {
  const { t } = useTranslation()
  return (
    <div data-testid="privacy-panel" className="space-y-6">
      <p className="text-sm">{t('settings.privacyPage.intro')}</p>
      <section aria-labelledby="privacy-local" className="space-y-1">
        <h3 id="privacy-local" className="text-sm font-semibold">
          {t('settings.privacyPage.localTitle')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('settings.privacyPage.localBody')}</p>
      </section>
      <section aria-labelledby="privacy-leaves" className="space-y-2">
        <div>
          <h3 id="privacy-leaves" className="text-sm font-semibold">
            {t('settings.privacyPage.leavesTitle')}
          </h3>
          <p className="text-muted-foreground text-sm">{t('settings.privacyPage.leavesHint')}</p>
        </div>
        <ul className="divide-border border-border bg-card divide-y rounded-xl border">
          {DESTINATIONS.map((d) => (
            <li key={d} className="px-4 py-3">
              <div className="text-sm font-medium">{t(`settings.privacyPage.${d}`)}</div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {t(`settings.privacyPage.${d}Body`)}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="privacy-control" className="space-y-1">
        <h3 id="privacy-control" className="text-sm font-semibold">
          {t('settings.privacyPage.deleteTitle')}
        </h3>
        <p className="text-muted-foreground text-sm">{t('settings.privacyPage.deleteBody')}</p>
      </section>
    </div>
  )
}
