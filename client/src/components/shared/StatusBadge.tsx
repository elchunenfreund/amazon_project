import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type StatusType =
  | 'available'
  | 'unavailable'
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'

interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: StatusType | string
  showDot?: boolean
}

const statusConfig: Record<StatusType, { variant: BadgeProps['variant']; label?: string }> = {
  available: { variant: 'success', label: 'Available' },
  unavailable: { variant: 'destructive', label: 'Unavailable' },
  pending: { variant: 'warning', label: 'Pending' },
  accepted: { variant: 'success', label: 'Accepted' },
  rejected: { variant: 'destructive', label: 'Rejected' },
  shipped: { variant: 'default', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  cancelled: { variant: 'secondary', label: 'Cancelled' },
  success: { variant: 'success' },
  warning: { variant: 'warning' },
  error: { variant: 'destructive' },
  info: { variant: 'default' },
}

export function StatusBadge({ status, showDot = true, className, children, ...props }: StatusBadgeProps) {
  const config = statusConfig[status as StatusType] ?? { variant: 'secondary' as const }
  const label = children ?? config.label ?? status

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)} {...props}>
      {showDot && (
        <span
          className={cn(
            'mr-1.5 h-1.5 w-1.5 rounded-full',
            config.variant === 'success' && 'bg-green-100',
            config.variant === 'destructive' && 'bg-red-100',
            config.variant === 'warning' && 'bg-yellow-100',
            config.variant === 'default' && 'bg-blue-100',
            config.variant === 'secondary' && 'bg-gray-300'
          )}
        />
      )}
      {label}
    </Badge>
  )
}

// PO State Badge with specific states
type POState = 'NEW' | 'ACKNOWLEDGED' | 'SHIPPED' | 'RECEIVING' | 'CLOSED' | 'CANCELLED'

interface POStateBadgeProps extends Omit<BadgeProps, 'variant'> {
  state: POState | string
}

const poStateConfig: Record<POState, { variant: BadgeProps['variant']; label: string }> = {
  NEW: { variant: 'default', label: 'New' },
  ACKNOWLEDGED: { variant: 'warning', label: 'Acknowledged' },
  SHIPPED: { variant: 'default', label: 'Shipped' },
  RECEIVING: { variant: 'warning', label: 'Receiving' },
  CLOSED: { variant: 'success', label: 'Closed' },
  CANCELLED: { variant: 'secondary', label: 'Cancelled' },
}

export function POStateBadge({ state, className, ...props }: POStateBadgeProps) {
  const config = poStateConfig[state as POState] ?? { variant: 'secondary' as const, label: state }

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)} {...props}>
      {config.label}
    </Badge>
  )
}

// Availability Badge
interface AvailabilityBadgeProps extends Omit<BadgeProps, 'variant'> {
  available: boolean | null | undefined
}

export function AvailabilityBadge({ available, className, ...props }: AvailabilityBadgeProps) {
  if (available === null || available === undefined) {
    return (
      <Badge variant="secondary" className={className} {...props}>
        Unknown
      </Badge>
    )
  }

  return (
    <Badge
      variant={available ? 'success' : 'destructive'}
      className={className}
      {...props}
    >
      <span
        className={cn(
          'mr-1.5 h-1.5 w-1.5 rounded-full',
          available ? 'bg-green-100' : 'bg-red-100'
        )}
      />
      {available ? 'Available' : 'Unavailable'}
    </Badge>
  )
}
