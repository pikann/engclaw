import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import notices from '../../../../../../THIRD_PARTY_LICENSES.md?raw'
import { parseLicenses } from '@/lib/licenses'

const REPO_URL = 'https://github.com/pikann/engclaw'

/** Engclaw's own license plus the generated third-party notices. */
export function LicensesPanel() {
  const { t } = useTranslation()
  const entries = useMemo(() => parseLicenses(notices), [])
  const link =
    'text-primary underline underline-offset-2 focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]'
  return (
    <div data-testid="licenses-panel" className="space-y-4">
      <p className="text-sm">{t('settings.licensesPage.intro')}</p>
      <p className="text-sm">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={link}>
          {t('settings.licensesPage.source')}
        </a>
      </p>
      <h3 className="text-sm font-semibold">
        {t('settings.licensesPage.list')} ({entries.length})
      </h3>
      <ul
        tabIndex={0}
        aria-label={t('settings.licensesPage.list')}
        className="divide-border border-border bg-card focus-visible:ring-ring/50 max-h-96 divide-y overflow-y-auto rounded-xl border outline-none focus-visible:ring-[3px]"
      >
        {entries.map((e) => (
          <li key={e.name} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
            <a href={e.url} target="_blank" rel="noreferrer" className={link}>
              {e.name}
            </a>
            <span className="text-muted-foreground shrink-0 text-xs">{e.license}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
