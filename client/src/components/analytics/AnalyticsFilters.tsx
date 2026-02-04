import { useState, useEffect } from 'react'
import type { DateRange } from 'react-day-picker'
import { DateRangePicker } from '@/components/shared'
import { useAvailableWeeks } from '@/hooks/useVendorReports'
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
    distributorView?: string
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
  const [distributorView, setDistributorView] = useState<string>('MANUFACTURING')

  // Fetch available weeks based on distributor view
  const { data: availableWeeks } = useAvailableWeeks(
    distributorView === 'ALL' ? undefined : distributorView
  )

  // Auto-select most recent week when weeks are loaded and no date is selected
  useEffect(() => {
    if (availableWeeks && availableWeeks.length > 0 && !dateRange) {
      const mostRecent = availableWeeks[0]
      const newRange = {
        from: new Date(mostRecent.start),
        to: new Date(mostRecent.end),
      }
      setDateRange(newRange)
      onFilterChange({
        startDate: mostRecent.start,
        endDate: mostRecent.end,
        asin: selectedAsin || undefined,
        distributorView: distributorView,
      })
    }
  }, [availableWeeks])

  const handleDateChange = (range: DateRange | undefined) => {
    setDateRange(range)
    onFilterChange({
      startDate: range?.from?.toISOString().split('T')[0],
      endDate: range?.to?.toISOString().split('T')[0],
      asin: selectedAsin || undefined,
      distributorView: distributorView,
    })
  }

  const handleAsinChange = (asin: string) => {
    setSelectedAsin(asin)
    onFilterChange({
      startDate: dateRange?.from?.toISOString().split('T')[0],
      endDate: dateRange?.to?.toISOString().split('T')[0],
      asin: asin === 'all' ? undefined : asin,
      distributorView: distributorView,
    })
  }

  const handleViewChange = (view: string) => {
    setDistributorView(view)
    onFilterChange({
      startDate: dateRange?.from?.toISOString().split('T')[0],
      endDate: dateRange?.to?.toISOString().split('T')[0],
      asin: selectedAsin === 'all' ? undefined : selectedAsin || undefined,
      distributorView: view,
    })
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-4">
        <DateRangePicker
          value={dateRange}
          onChange={handleDateChange}
          placeholder="Select date range"
          availableWeeks={availableWeeks}
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

        <Select value={distributorView} onValueChange={handleViewChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Data View" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MANUFACTURING">Manufacturing</SelectItem>
            <SelectItem value="SOURCING">Sourcing</SelectItem>
            <SelectItem value="ALL">All Data</SelectItem>
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
