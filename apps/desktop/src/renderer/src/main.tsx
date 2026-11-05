import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import { AppLayout } from '@/components/app-shell'
import { ComingSoon, Home } from '@/routes/home'
import { HistoryPage } from '@/routes/history'
import { SettingsPage } from '@/routes/settings'
import { initI18n } from '@/lib/i18n'
import { setThemePreference, useTheme, useThemePreference } from '@/lib/theme'
import './index.css'

// The kitchen-sink route is dev/test only: the flag is a build-time constant, so it is
// tree-shaken out of release builds.
const showDesignSystem = import.meta.env.DEV || import.meta.env.VITE_DESIGN_SYSTEM === '1'

const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'practice', element: null },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <ComingSoon /> },
    ],
  },
  ...(showDesignSystem
    ? [
        {
          path: '/dev/ping',
          lazy: async () => ({ Component: (await import('@/routes/dev-ping')).DevPing }),
        },
        {
          path: '/design-system',
          lazy: async () => ({ Component: (await import('@/routes/design-system')).DesignSystem }),
        },
        {
          path: '/screens/core',
          lazy: async () => ({ Component: (await import('@/routes/screens-core')).ScreensCore }),
        },
        {
          path: '/screens/home',
          lazy: async () => ({ Component: (await import('@/routes/screens-home')).ScreensHome }),
        },
        {
          path: '/screens/agent',
          lazy: async () => ({ Component: (await import('@/routes/screens-agent')).ScreensAgent }),
        },
        {
          path: '/screens/game',
          lazy: async () => ({ Component: (await import('@/routes/screens-game')).ScreensGame }),
        },
        {
          path: '/screens/dictionary',
          lazy: async () => ({
            Component: (await import('@/routes/screens-dictionary')).ScreensDictionary,
          }),
        },
      ]
    : []),
])

/** Applies the persisted theme preference (system / light / dark) to <html>. */
function ThemeRoot({ children }: { children: React.ReactNode }) {
  const pref = useThemePreference()
  useTheme(pref)
  useEffect(() => {
    void window.engclaw.app.getSettings().then((s) => setThemePreference(s.theme))
  }, [])
  return children
}

void initI18n().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ThemeRoot>
        <RouterProvider router={router} />
      </ThemeRoot>
    </StrictMode>,
  ),
)
