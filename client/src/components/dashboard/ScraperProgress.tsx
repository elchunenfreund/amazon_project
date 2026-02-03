import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ScraperProgressProps {
  progress: {
    current: number
    total: number
    asin: string
    status: 'checking' | 'complete' | 'error'
    available?: boolean
    title?: string
  } | null
}

export function ScraperProgress({ progress }: ScraperProgressProps) {
  if (!progress) return null

  const percentage = Math.round((progress.current / progress.total) * 100)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-6"
      >
        <Card className="border-accent/50 bg-accent/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {/* Progress indicator */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
                {progress.status === 'checking' && (
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                )}
                {progress.status === 'complete' && progress.available && (
                  <CheckCircle className="h-5 w-5 text-success" />
                )}
                {progress.status === 'complete' && !progress.available && (
                  <XCircle className="h-5 w-5 text-danger" />
                )}
                {progress.status === 'error' && (
                  <XCircle className="h-5 w-5 text-warning" />
                )}
              </div>

              {/* Progress info */}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {progress.status === 'checking' ? 'Checking' : 'Checked'}{' '}
                    <span className="font-mono">{progress.asin}</span>
                  </p>
                  <span className="text-sm text-muted">
                    {progress.current} / {progress.total}
                  </span>
                </div>
                {progress.title && (
                  <p className="line-clamp-1 text-sm text-muted">{progress.title}</p>
                )}

                {/* Progress bar */}
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent/20">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      progress.status === 'error' ? 'bg-warning' : 'bg-accent'
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
