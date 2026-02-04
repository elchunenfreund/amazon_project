import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { DateRangePicker } from '@/components/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface AnalyticsFiltersProps {
  asins: string[]
  onFilterChange: (filters: {
    startDate?: string
    endDate?: string
    asin?: string
  }) => void
  onSync?: () => void
  isSyncing?: boolean
  defaultStartDate?: string
  defaultEndDate?: string
}

export function AnalyticsFilters({
  asins,
  onFilterChange,
  onSync,
  isSyncing = false,
  defaultStartDate,
  defaultEndDate,
}: AnalyticsFiltersProps) {
  // Initialize with default date range if provided
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (defaultStartDate && defaultEndDate) {
      return {
        from: new Date(defaultStartDate),
        to: new Date(defaultEndDate),
      }
    }
    return undefined
  })
  const [selectedAsin, setSelectedAsin] = useState<string>('')

  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range)
    onFilterChange({
      startDate: range?.from?.toISOString().split('T')[0],
      endDate: range?.to?.toISOString().split('T')[0],
      asin: selectedAsin || undefined,
    })
  }

  const handleAsinChange = (asin: string) => {
    setSelectedAsin(asin)
    onFilterChange({
      startDate: dateRange?.from?.toISOString().split('T')[0],
      endDate: dateRange?.to?.toISOString().split('T')[0],
      asin: asin === 'all' ? undefined : asin,
    })
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-4">
        <DateRangePicker
          value={dateRange}
          onChange={handleDateChange}
          placeholder="Select date range"
        />

        <Select value={selectedAsin} onValueChange={handleAsinChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All ASINs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ASINs</SelectItem>
            {asins.map((asin) => (
              <SelectItem key={asin} value={asin}>
                {asin}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onSync && (
        <Button variant="outline" onClick={onSync} disabled={isSyncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync Reports'}
        </Button>
      )}
    </div>
  )
}
