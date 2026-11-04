import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PracticeCard } from '@/components/practice-card'
import { HistoryPanel } from '@/components/history-panel'
import { SettingsPanel } from '@/components/settings-panel'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'

export function Home() {
  const { t } = useTranslation()
  const [reply, setReply] = useState('')
  const [tab, setTab] = useState<'practice' | 'history' | 'settings'>('practice')
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" data-testid="title">
          {t('app.hello')}
        </h1>
        <LanguageSwitcher />
      </div>
      <Button
        data-testid="ping"
        onClick={async () => {
          const res = await window.engclaw.ping({ message: 'hello' })
          setReply(`${res.echo}@${res.platform}`)
        }}
      >
        {t('ping.button')}
      </Button>
      <p data-testid="reply" className="text-muted-foreground">
        {reply}
      </p>
      <nav className="flex gap-2" aria-label="main">
        {(['practice', 'history', 'settings'] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={tab === k ? 'default' : 'outline'}
            aria-pressed={tab === k}
            data-testid={`tab-${k}`}
            onClick={() => setTab(k)}
          >
            {t(`nav.${k}`)}
          </Button>
        ))}
      </nav>
      {/* Practice stays mounted so an in-flight analysis survives a tab switch. */}
      <div hidden={tab !== 'practice'}>
        <PracticeCard />
      </div>
      {tab === 'history' && <HistoryPanel />}
      {tab === 'settings' && <SettingsPanel />}
    </main>
  )
}
