import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function Home() {
  const [reply, setReply] = useState('')
  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Engclaw</h1>
      <Button
        data-testid="ping"
        onClick={async () => {
          const res = await window.engclaw.ping({ message: 'hello' })
          setReply(`${res.echo}@${res.platform}`)
        }}
      >
        Ping main
      </Button>
      <p data-testid="reply" className="text-muted-foreground">
        {reply}
      </p>
    </main>
  )
}
