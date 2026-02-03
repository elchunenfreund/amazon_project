import { Link } from 'react-router-dom'
import { PageWrapper } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'

export function NotFound() {
  return (
    <PageWrapper>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-6xl font-extrabold text-primary">404</h1>
        <p className="mt-4 text-xl text-secondary">Page not found</p>
        <p className="mt-2 text-muted">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild className="mt-8">
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </PageWrapper>
  )
}
