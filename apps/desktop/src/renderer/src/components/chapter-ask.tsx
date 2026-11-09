import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CHAPTER_ASK_KINDS } from '@/lib/ask-agent'
import type { ChapterAskProps } from '@/lib/use-ask-agent'

/** "Ask the agent" about the whole chapter target: quick prompts and a free question. */
export function ChapterAsk({
  text,
  hasAttempts,
  busy = false,
  available,
  onAsk,
  onSetup,
}: ChapterAskProps & { text: string; hasAttempts: boolean; busy?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const kinds = CHAPTER_ASK_KINDS.filter((k) => k !== 'mistakes' || hasAttempts)
  return (
    <div className="space-y-1" data-testid="chapter-ask">
      <Button
        variant="secondary"
        size="sm"
        disabled={!available || busy}
        data-testid="ask-button"
        onClick={() => setOpen(true)}
      >
        <MessageCircle />
        {t('screens.game.askTitle')}
      </Button>
      {!available && (
        <p className="text-muted-foreground text-xs" data-testid="ask-setup-hint">
          {t('screens.game.noProviderHint')}{' '}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={onSetup}>
            {t('screens.game.openSettings')}
          </Button>
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="chapter-ask-dialog">
          <DialogTitle>{t('screens.game.askAbout', { target: text })}</DialogTitle>
          <DialogDescription>{t('screens.game.askHint')}</DialogDescription>
          <ul aria-label={t('dict.askPrompts')} className="flex flex-wrap gap-2">
            {kinds.map((kind) => (
              <li key={kind}>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`chapter-ask-${kind}`}
                  onClick={() => onAsk(kind)}
                >
                  {t(`screens.game.askPrompt.${kind}`)}
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              onAsk('free', question)
            }}
          >
            <Input
              aria-label={t('screens.converse.typeLabel')}
              placeholder={t('screens.converse.typePlaceholder')}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              data-testid="chapter-ask-input"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!question.trim()}
              aria-label={t('screens.converse.send')}
            >
              <Send />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
