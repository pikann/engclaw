import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router'
import { Home } from '@/routes/home'
import { initI18n } from '@/lib/i18n'
import './index.css'

const router = createHashRouter([{ path: '/', element: <Home /> }])

void initI18n().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  ),
)
