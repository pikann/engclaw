import { app, BrowserWindow, Menu, dialog, type MenuItemConstructorOptions } from 'electron'
import { SUPPORTED_LOCALES, type Locale } from '@engclaw/i18n'
import { t } from './i18n'

export function buildMenu(current: Locale, onLanguage: (l: Locale) => void): void {
  const isMac = process.platform === 'darwin'
  const name = app.name
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: name,
            submenu: [
              { role: 'about', label: t('menu.about', { name }) },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit', { name }) },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: t('menu.file'),
      submenu: [isMac ? { role: 'close' } : { role: 'quit', label: t('menu.quit', { name }) }],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: t('menu.language'),
      submenu: SUPPORTED_LOCALES.map((l) => ({
        label: t(`language.${l}`, { ns: 'common' }),
        type: 'radio' as const,
        checked: l === current,
        click: () => onLanguage(l),
      })),
    },
    { label: t('menu.window'), submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Localized "update ready" prompt; resolves true when the user chooses to restart. */
export async function promptUpdateReady(win: BrowserWindow, version: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('dialog.updateReadyTitle'),
    message: t('dialog.updateReadyMessage', { version }),
    buttons: [t('dialog.restart'), t('dialog.later')],
    defaultId: 0,
    cancelId: 1,
  })
  return response === 0
}
