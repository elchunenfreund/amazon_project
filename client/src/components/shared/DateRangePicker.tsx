import { useState } from 'react'
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfYear } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  presets?: boolean
}

const presetRanges = [
  {
    label: 'Today',
    getValue: () => ({ from: new Date(), to: new Date() }),
  },
  {
    label: 'Yesterday',
    getValue: () => {
      const yesterday = subDays(new Date(), 1)
      return { from: yesterday, to: yesterday }
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: 'Last 30 days',
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: 'This month',
    getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: 'Last month',
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1)
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) }
    },
  },
  {
    label: 'This year',
    getValue: () => ({ from: startOfYear(new Date()), to: new Date() }),
  },
]

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Pick a date range',
  className,
  presets = true,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const handleSelect = (range: DateRange | undefined) => {
    onChange(range)
  }

  const handlePresetClick = (preset: (typeof presetRanges)[0]) => {
    onChange(preset.getValue())
    setOpen(false)
  }

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
        <div className={cn('flex', presets && 'flex-col sm:flex-row')}>
          {presets && (
            <div className="flex flex-col gap-1 border-b p-3 sm:border-b-0 sm:border-r">
              {presetRanges.map((preset) => (
                <Button
                  key={preset.label}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
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
            defaultMonth={value?.from}
            selected={value}
            onSelect={handleSelect}
            numberOfMonths={2}
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
