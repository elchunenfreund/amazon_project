import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initCsrf, getAppConfig } from './lib/api'

// Initialize CSRF token and app config on app load
initCsrf()
getAppConfig()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
