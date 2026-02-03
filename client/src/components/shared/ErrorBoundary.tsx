import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Card className="mx-auto my-8 max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
              <AlertTriangle className="h-6 w-6 text-danger" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Something went wrong</h2>
              <p className="mt-1 text-sm text-muted">
                {this.state.error?.message ?? 'An unexpected error occurred'}
              </p>
            </div>
            <Button onClick={this.handleRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}

// Query Error component
interface QueryErrorProps {
  error: Error | null
  onRetry?: () => void
}

export function QueryError({ error, onRetry }: QueryErrorProps) {
  if (!error) return null

  return (
    <Card className="border-danger/50 bg-danger/5">
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-danger" />
          <div>
            <p className="font-medium text-danger">Failed to load data</p>
            <p className="text-sm text-muted">{error.message}</p>
          </div>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// Empty state component
interface EmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        {icon && (
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            {icon}
          </div>
        )}
        <h3 className="text-lg font-medium">{title}</h3>
        {description && (
          <p className="mt-1 text-center text-sm text-muted">{description}</p>
        )}
        {action && (
          <Button className="mt-4" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
