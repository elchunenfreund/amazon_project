import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryProvider } from '@/lib/query'
import { AppShell } from '@/components/layout'
import { ErrorBoundary } from '@/components/shared'
import {
  Dashboard,
  Products,
  Analytics,
  Orders,
  History,
  ApiExplorer,
  CatalogDetails,
  NotFound,
} from '@/pages'
import Login from '@/pages/Login'

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <BrowserRouter>
          <Routes>
            {/* Login page without AppShell */}
            <Route path="/login" element={<Login />} />

            {/* Main app routes with AppShell */}
            <Route
              path="/*"
              element={
                <AppShell>
                  <AnimatePresence mode="wait">
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/products" element={<Products />} />
                      <Route path="/analytics" element={<Analytics />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/history/:asin" element={<History />} />
                      <Route path="/api-explorer" element={<ApiExplorer />} />
                      <Route path="/catalog/:asin" element={<CatalogDetails />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AnimatePresence>
                </AppShell>
              }
            />
          </Routes>
        </BrowserRouter>
      </QueryProvider>
    </ErrorBoundary>
  )
}

export default App
