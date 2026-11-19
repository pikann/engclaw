import { expect, type Page } from '@playwright/test'

const LABELS = { en: 'English', zh: 'Chinese (China)' } as const

export async function chooseLearningLanguage(page: Page, language: keyof typeof LABELS) {
  await page.getByTestId('learning-language').click()
  await page.getByRole('option', { name: LABELS[language], exact: true }).click()
}

export async function expectLearningLanguage(page: Page, language: keyof typeof LABELS) {
  await expect(page.getByTestId('learning-language')).toHaveText(LABELS[language])
}
