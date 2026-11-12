import { useTranslation } from 'react-i18next'
import type { DictionaryWord } from '@engclaw/ipc-contract'
import { HearReference } from '@/components/hear-reference'
import { Button } from '@/components/ui/button'

export function ChineseWord({
  word,
  onPractice,
}: {
  word: DictionaryWord
  onPractice: (text: string) => void
}) {
  const { t } = useTranslation()
  return (
    <article className="space-y-5" data-testid="word-page">
      <h2 lang="zh-CN" className="text-3xl font-semibold">
        {word.word}
      </h2>
      <p lang="zh-Latn-pinyin" className="text-xl" data-testid="word-pinyin">
        {word.pinyin}
      </p>
      {word.traditional !== word.word && (
        <p>
          {t('learning.traditional')}: <span lang="zh-TW">{word.traditional}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <HearReference text={word.word} />
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPractice(word.word)}
          data-testid="send-practice"
        >
          {t('dict.sendPractice')}
        </Button>
      </div>
      <h3 className="font-semibold">{t('learning.chineseDefinitions')}</h3>
      <ol lang="en" className="list-decimal space-y-2 pl-5">
        {word.senses.map((sense, index) => (
          <li key={index}>{sense.definition}</li>
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">
        <a
          href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          CC-CEDICT
        </a>{' '}
        · CC BY-SA 4.0
      </p>
    </article>
  )
}
