import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  isLoading?: boolean
}

export function StatCard({
  title,
  value,
  description,
  icon,
  trend,
  className,
  isLoading = false,
}: StatCardProps) {
  if (isLoading) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={cn('overflow-hidden transition-shadow hover:shadow-md', className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted">{title}</p>
              <p className="text-3xl font-bold text-primary">{value}</p>
              {(description || trend) && (
                <div className="flex items-center gap-2 text-sm">
                  {trend && (
                    <span
                      className={cn(
                        'font-medium',
                        trend.isPositive ? 'text-success' : 'text-danger'
                      )}
                    >
                      {trend.isPositive ? '+' : ''}{trend.value}%
                    </span>
                  )}
                  {description && (
                    <span className="text-muted">{description}</span>
                  )}
                </div>
              )}
            </div>
            {icon && (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {icon}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

interface StatCardGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4
}

export function StatCardGrid({ children, columns = 4 }: StatCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns])}>
      {children}
    </div>
  )
}
