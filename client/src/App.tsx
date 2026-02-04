import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { QueryProvider } from '@/lib/query'
import { AppShell } from '@/components/layout'
import { ErrorBoundary } from '@/components/shared'
import { Dashboard, NotFound } from '@/pages'

// Lazy load non-critical pages for better initial bundle size
const Products = lazy(() => import('@/pages/Products').then(m => ({ default: m.Products })))
const Analytics = lazy(() => import('@/pages/Analytics').then(m => ({ default: m.Analytics })))
const Orders = lazy(() => import('@/pages/Orders').then(m => ({ default: m.Orders })))
const History = lazy(() => import('@/pages/History').then(m => ({ default: m.History })))
const ApiExplorer = lazy(() => import('@/pages/ApiExplorer').then(m => ({ default: m.ApiExplorer })))
const CatalogDetails = lazy(() => import('@/pages/CatalogDetails').then(m => ({ default: m.CatalogDetails })))
const Login = lazy(() => import('@/pages/Login'))

// Loading fallback for lazy-loaded pages
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Login page without AppShell */}
              <Route path="/login" element={<Login />} />

              {/* Main app routes with AppShell */}
              <Route
                path="/*"
                element={
                  <AppShell>
                    <AnimatePresence mode="wait">
                      <Suspense fallback={<PageLoader />}>
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
                      </Suspense>
                    </AnimatePresence>
                  </AppShell>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryProvider>
    </ErrorBoundary>
  )
}

export default App
