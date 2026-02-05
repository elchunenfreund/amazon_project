import { useState, useMemo } from 'react'
import { format, parseISO, isSameDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subWeeks, subMonths } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Helper to parse ISO date strings without timezone issues
// Strips time component to avoid UTC-to-local conversion problems
// e.g., "2026-01-31T00:00:00.000Z" in EST becomes Jan 30 at 7pm without this fix
function parseDate(isoString: string): Date {
  return parseISO(isoString.split('T')[0])
}

interface SmartPreset {
  label: string
  getValue: (availableWeeks: WeekBoundary[]) => { from: Date; to: Date } | null
}

export interface WeekBoundary {
  start: string
  end: string
}

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  presets?: boolean
  availableWeeks?: WeekBoundary[]
}

// Helper to find weeks that overlap with a date range
function getWeeksInRange(weeks: WeekBoundary[], rangeStart: Date, rangeEnd: Date): WeekBoundary[] {
  return weeks.filter(week => {
    const weekStart = parseDate(week.start)
    const weekEnd = parseDate(week.end)
    // Week overlaps if it starts before range ends AND ends after range starts
    return weekStart <= rangeEnd && weekEnd >= rangeStart
  })
}

// Smart presets that work with available weeks
const SMART_PRESETS: SmartPreset[] = [
  {
    label: 'This Week',
    getValue: (weeks) => {
      const today = new Date()
      const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 })
      const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 })
      const matching = getWeeksInRange(weeks, thisWeekStart, thisWeekEnd)
      if (matching.length > 0) {
        return { from: parseDate(matching[0].start), to: parseDate(matching[0].end) }
      }
      return null
    }
  },
  {
    label: 'Last Week',
    getValue: (weeks) => {
      const lastWeek = subWeeks(new Date(), 1)
      const lastWeekStart = startOfWeek(lastWeek, { weekStartsOn: 0 })
      const lastWeekEnd = endOfWeek(lastWeek, { weekStartsOn: 0 })
      const matching = getWeeksInRange(weeks, lastWeekStart, lastWeekEnd)
      if (matching.length > 0) {
        return { from: parseDate(matching[0].start), to: parseDate(matching[0].end) }
      }
      return null
    }
  },
  {
    label: 'This Month',
    getValue: (weeks) => {
      const today = new Date()
      const monthStart = startOfMonth(today)
      const monthEnd = endOfMonth(today)
      const matching = getWeeksInRange(weeks, monthStart, monthEnd)
      if (matching.length > 0) {
        // Get all weeks that overlap with this month, sorted by start date
        const sorted = [...matching].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
        return { from: parseDate(sorted[0].start), to: parseDate(sorted[sorted.length - 1].end) }
      }
      return null
    }
  },
  {
    label: 'Last Month',
    getValue: (weeks) => {
      const lastMonth = subMonths(new Date(), 1)
      const monthStart = startOfMonth(lastMonth)
      const monthEnd = endOfMonth(lastMonth)
      const matching = getWeeksInRange(weeks, monthStart, monthEnd)
      if (matching.length > 0) {
        const sorted = [...matching].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
        return { from: parseDate(sorted[0].start), to: parseDate(sorted[sorted.length - 1].end) }
      }
      return null
    }
  },
  {
    label: 'This Year',
    getValue: (weeks) => {
      const today = new Date()
      const yearStart = startOfYear(today)
      const matching = getWeeksInRange(weeks, yearStart, today)
      if (matching.length > 0) {
        const sorted = [...matching].sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
        return { from: parseDate(sorted[0].start), to: parseDate(sorted[sorted.length - 1].end) }
      }
      return null
    }
  },
]

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className,
  presets = true,
  availableWeeks,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  // Calculate smart presets based on available data
  const smartPresets = useMemo(() => {
    if (!availableWeeks || availableWeeks.length === 0) {
      return []
    }

    return SMART_PRESETS.map(preset => ({
      ...preset,
      range: preset.getValue(availableWeeks)
    })).filter(p => p.range !== null)
  }, [availableWeeks])

  // Check if a date is a valid selection point
  const isDateDisabled = (date: Date): boolean => {
    if (!availableWeeks || availableWeeks.length === 0) return false

    // Allow clicking on any date that falls within an available week
    return !availableWeeks.some(week => {
      const weekStart = parseDate(week.start)
      const weekEnd = parseDate(week.end)
      return date >= weekStart && date <= weekEnd
    })
  }

  // Modifier for week start dates (style differently)
  const weekStartDates = useMemo(() => {
    if (!availableWeeks) return []
    return availableWeeks.map(w => parseDate(w.start))
  }, [availableWeeks])

  // Modifier for week end dates
  const weekEndDates = useMemo(() => {
    if (!availableWeeks) return []
    return availableWeeks.map(w => parseDate(w.end))
  }, [availableWeeks])

  const handleSelect = (range: DateRange | undefined) => {
    if (!range?.from || !availableWeeks || availableWeeks.length === 0) {
      onChange(range)
      return
    }

    // If user clicks a start date, find the corresponding week and auto-select the range
    const clickedDateStr = format(range.from, 'yyyy-MM-dd')

    // Check if clicked date is a week start - auto-select full week
    // Match against date-only portion of the ISO string
    if (!range.to) {
      const weekByStart = availableWeeks.find(w => w.start.split('T')[0] === clickedDateStr)
      if (weekByStart) {
        onChange({ from: parseDate(weekByStart.start), to: parseDate(weekByStart.end) })
        return
      }
    }

    // Check if clicked date is a week end - auto-select full week
    if (!range.to) {
      const weekByEnd = availableWeeks.find(w => w.end.split('T')[0] === clickedDateStr)
      if (weekByEnd) {
        onChange({ from: parseDate(weekByEnd.start), to: parseDate(weekByEnd.end) })
        return
      }
    }

    // For multi-week selection, snap to valid boundaries
    if (range.from && range.to) {
      // Find the week containing the start date
      const startWeek = availableWeeks.find(w => {
        const ws = parseDate(w.start)
        const we = parseDate(w.end)
        return range.from! >= ws && range.from! <= we
      })
      // Find the week containing the end date
      const endWeek = availableWeeks.find(w => {
        const ws = parseDate(w.start)
        const we = parseDate(w.end)
        return range.to! >= ws && range.to! <= we
      })

      if (startWeek && endWeek) {
        onChange({ from: parseDate(startWeek.start), to: parseDate(endWeek.end) })
        return
      }
    }

    onChange(range)
  }

  const handleSmartPresetClick = (range: { from: Date; to: Date }) => {
    onChange(range)
    setOpen(false)
  }

  const showPresets = presets && availableWeeks && smartPresets.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[280px] justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, 'LLL dd, y')} - {format(value.to, 'LLL dd, y')}
              </>
            ) : (
              format(value.from, 'LLL dd, y')
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          {/* Left sidebar: Presets */}
          {showPresets && (
            <div data-testid="date-presets" className="flex flex-col gap-1 border-r p-3 min-w-[150px] max-h-[400px] overflow-y-auto bg-muted/20">
              {/* Quick Select Presets */}
              <div className="text-xs font-semibold text-foreground mb-2">Quick Select</div>
              {smartPresets.map((preset, idx) => (
                <Button
                  key={`smart-${idx}`}
                  variant={value?.from && preset.range && isSameDay(value.from, preset.range.from) && value.to && isSameDay(value.to, preset.range.to) ? 'default' : 'ghost'}
                  size="sm"
                  className="justify-start text-sm h-8"
                  onClick={() => preset.range && handleSmartPresetClick(preset.range)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}

          {/* Right side: Calendar */}
          <div className="flex flex-col">
            {/* Legend */}
            {availableWeeks && availableWeeks.length > 0 && (
              <div className="px-3 py-2 border-b bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 ring-2 ring-blue-500 mr-1 align-middle" />
                  <span className="mr-4">Sunday (start)</span>
                  <span className="inline-block w-3 h-3 rounded bg-green-200 dark:bg-green-800 ring-2 ring-green-500 mr-1 align-middle" />
                  <span>Saturday (end)</span>
                </p>
              </div>
            )}
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={value?.from || weekStartDates[0]}
              selected={value}
              onSelect={handleSelect}
              numberOfMonths={2}
              weekStartsOn={0}
              disabled={availableWeeks && availableWeeks.length > 0 ? isDateDisabled : undefined}
              modifiers={{
                weekStart: weekStartDates,
                weekEnd: weekEndDates,
              }}
              modifiersClassNames={{
                weekStart: 'bg-blue-200 dark:bg-blue-800 font-bold ring-2 ring-blue-500 ring-inset rounded-l-md',
                weekEnd: 'bg-green-200 dark:bg-green-800 font-bold ring-2 ring-green-500 ring-inset rounded-r-md',
              }}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Single date picker
interface DatePickerProps {
  value?: Date
  onChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[200px] justify-start text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, 'PPP') : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange(date)
            setOpen(false)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
