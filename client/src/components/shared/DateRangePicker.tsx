import { useState, useMemo } from 'react'
import { format, parseISO, isSameDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

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

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className,
  presets = true,
  availableWeeks,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  // Build sets of valid start and end dates from available weeks
  const { validStartDates, validEndDates, weekPresets } = useMemo(() => {
    if (!availableWeeks || availableWeeks.length === 0) {
      return { validStartDates: new Set<string>(), validEndDates: new Set<string>(), weekPresets: [] }
    }

    const starts = new Set<string>()
    const ends = new Set<string>()

    availableWeeks.forEach(week => {
      starts.add(week.start)
      ends.add(week.end)
    })

    // Create presets from available weeks (most recent first)
    const presets = availableWeeks.slice(0, 8).map(week => {
      const startDate = parseISO(week.start)
      const endDate = parseISO(week.end)
      return {
        label: `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`,
        start: startDate,
        end: endDate,
      }
    })

    return { validStartDates: starts, validEndDates: ends, weekPresets: presets }
  }, [availableWeeks])

  // Check if a date is a valid selection point
  const isDateDisabled = (date: Date): boolean => {
    if (!availableWeeks || availableWeeks.length === 0) return false

    const dateStr = format(date, 'yyyy-MM-dd')
    // Allow clicking on any valid start or end date
    return !validStartDates.has(dateStr) && !validEndDates.has(dateStr)
  }

  // Modifier for week start dates (style differently)
  const weekStartDates = useMemo(() => {
    if (!availableWeeks) return []
    return availableWeeks.map(w => parseISO(w.start))
  }, [availableWeeks])

  // Modifier for week end dates
  const weekEndDates = useMemo(() => {
    if (!availableWeeks) return []
    return availableWeeks.map(w => parseISO(w.end))
  }, [availableWeeks])

  const handleSelect = (range: DateRange | undefined) => {
    if (!range?.from || !availableWeeks || availableWeeks.length === 0) {
      onChange(range)
      return
    }

    // If user clicks a start date, find the corresponding week and auto-select the range
    const clickedDateStr = format(range.from, 'yyyy-MM-dd')

    // Check if clicked date is a week start - auto-select full week
    if (validStartDates.has(clickedDateStr) && !range.to) {
      const week = availableWeeks.find(w => w.start === clickedDateStr)
      if (week) {
        onChange({ from: parseISO(week.start), to: parseISO(week.end) })
        return
      }
    }

    // Check if clicked date is a week end - auto-select full week
    if (validEndDates.has(clickedDateStr) && !range.to) {
      const week = availableWeeks.find(w => w.end === clickedDateStr)
      if (week) {
        onChange({ from: parseISO(week.start), to: parseISO(week.end) })
        return
      }
    }

    // For multi-week selection, snap to valid boundaries
    if (range.from && range.to) {
      // Find the week containing the start date
      const startWeek = availableWeeks.find(w => {
        const ws = parseISO(w.start)
        const we = parseISO(w.end)
        return range.from! >= ws && range.from! <= we
      })
      // Find the week containing the end date
      const endWeek = availableWeeks.find(w => {
        const ws = parseISO(w.start)
        const we = parseISO(w.end)
        return range.to! >= ws && range.to! <= we
      })

      if (startWeek && endWeek) {
        onChange({ from: parseISO(startWeek.start), to: parseISO(endWeek.end) })
        return
      }
    }

    onChange(range)
  }

  const handlePresetClick = (preset: { start: Date; end: Date }) => {
    onChange({ from: preset.start, to: preset.end })
    setOpen(false)
  }

  const showWeekPresets = presets && availableWeeks && weekPresets.length > 0

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
        <div className={cn('flex', showWeekPresets && 'flex-col sm:flex-row')}>
          {showWeekPresets && (
            <div className="flex flex-col gap-1 border-b p-3 sm:border-b-0 sm:border-r sm:max-h-[300px] sm:overflow-y-auto">
              <div className="text-xs font-medium text-muted-foreground mb-1">Available Weeks</div>
              {weekPresets.map((preset, idx) => (
                <Button
                  key={idx}
                  variant={value?.from && isSameDay(value.from, preset.start) ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-start text-xs"
                  onClick={() => handlePresetClick(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          )}
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from || weekStartDates[0]}
            selected={value}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={availableWeeks && availableWeeks.length > 0 ? isDateDisabled : undefined}
            modifiers={{
              weekStart: weekStartDates,
              weekEnd: weekEndDates,
            }}
            modifiersClassNames={{
              weekStart: 'bg-blue-100 dark:bg-blue-900 font-semibold',
              weekEnd: 'bg-green-100 dark:bg-green-900 font-semibold',
            }}
          />
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
