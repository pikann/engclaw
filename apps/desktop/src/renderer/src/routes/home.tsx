import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModelsPanel } from '@/components/models-panel'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'

export function Home() {
  const { t } = useTranslation()
  const [reply, setReply] = useState('')
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
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
      <ModelsPanel />
    </main>
  )
}
