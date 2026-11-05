import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

export function Home() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-2xl space-y-4" data-testid="home">
      <Logo className="text-primary h-8" />
      <h2 className="text-2xl font-semibold">{t('screens.home.welcome')}</h2>
      <p className="text-muted-foreground">{t('screens.home.welcomeBody')}</p>
      <Link to="/practice" data-testid="home-start" className={buttonVariants()}>
        {t('screens.home.card.practice.cta')}
      </Link>
    </section>
  )
}

export function ComingSoon() {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-2xl space-y-2" data-testid="coming-soon">
      <h2 className="text-xl font-semibold">{t('screens.shell.comingSoon')}</h2>
      <p className="text-muted-foreground">{t('screens.shell.comingSoonBody')}</p>
    </section>
  )
}
