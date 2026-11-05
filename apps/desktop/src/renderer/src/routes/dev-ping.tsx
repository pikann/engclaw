import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

/** IPC round-trip probe for the smoke test; only routed in dev/test builds. */
export function DevPing() {
  const { t } = useTranslation()
  const [reply, setReply] = useState('')
  return (
    <div className="space-y-3">
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
    </div>
  )
}
