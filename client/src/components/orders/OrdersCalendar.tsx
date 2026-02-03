import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { POStateBadge } from '@/components/shared/StatusBadge'
import { cn } from '@/lib/utils'
import type { PurchaseOrder } from '@/lib/api'

interface OrdersCalendarProps {
  orders: Record<string, PurchaseOrder[]>
  onDateClick?: (date: Date) => void
  isLoading?: boolean
}

export function OrdersCalendar({
  orders,
  onDateClick,
  isLoading = false,
}: OrdersCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const getOrdersForDate = (date: Date): PurchaseOrder[] => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return orders[dateStr] || []
  }

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-24 rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Week days header */}
      <div className="mb-2 grid grid-cols-7 gap-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-sm font-medium text-muted"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Empty cells for days before the month starts */}
        {Array.from({ length: days[0].getDay() }).map((_, i) => (
          <div key={`empty-start-${i}`} className="min-h-24 rounded-lg bg-slate-50/50" />
        ))}

        {/* Days of the month */}
        {days.map((day) => {
          const dayOrders = getOrdersForDate(day)
          const hasOrders = dayOrders.length > 0

          return (
            <div
              key={day.toISOString()}
              onClick={() => hasOrders && onDateClick?.(day)}
              className={cn(
                'min-h-24 rounded-lg border p-2 transition-colors',
                !isSameMonth(day, currentMonth) && 'bg-slate-50/50 text-muted',
                isToday(day) && 'border-accent bg-accent/5',
                hasOrders && 'cursor-pointer hover:border-accent hover:bg-accent/5',
                !hasOrders && 'border-transparent bg-slate-50/50'
              )}
            >
              <div
                className={cn(
                  'mb-1 text-sm font-medium',
                  isToday(day) && 'text-accent'
                )}
              >
                {format(day, 'd')}
              </div>
              {hasOrders && (
                <div className="space-y-1">
                  {dayOrders.slice(0, 2).map((order) => (
                    <div
                      key={order.po_number}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate font-mono">{order.po_number.slice(-6)}</span>
                      <POStateBadge state={order.po_state} className="scale-75" />
                    </div>
                  ))}
                  {dayOrders.length > 2 && (
                    <div className="text-xs text-muted">
                      +{dayOrders.length - 2} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Empty cells for days after the month ends */}
        {Array.from({ length: 6 - days[days.length - 1].getDay() }).map((_, i) => (
          <div key={`empty-end-${i}`} className="min-h-24 rounded-lg bg-slate-50/50" />
        ))}
      </div>
    </Card>
  )
}
