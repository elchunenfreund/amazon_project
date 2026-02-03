import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight text-primary lg:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-lg text-secondary">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 gap-3">
          {actions}
        </div>
      )}
    </div>
  )
}
