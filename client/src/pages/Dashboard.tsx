import { useState, useMemo } from 'react'
import type { DateRange } from 'react-day-picker'
import { format, subDays } from 'date-fns'
import { Package, CheckCircle, XCircle, Clock, Play, Square, RefreshCw, Plus, Upload, Wifi, WifiOff, Filter, History } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { StatCard, StatCardGrid, ConfirmModal, CsvExportModal, DateRangePicker, QueryError } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLatestAsins, useDeleteAsin, useToggleAsinSnooze, useStartScraper, useStopScraper, useScraperStatus, useSocket } from '@/hooks'
import {
  DashboardTable,
  AddAsinModal,
  EditAsinModal,
  ExcelUploadModal,
  ScraperProgress,
} from '@/components/dashboard'
import type { AsinReport, AsinFilters } from '@/lib/api'
import { isAsinReport } from '@/lib/type-guards'

// Baseline date options
const BASELINE_OPTIONS = [
  { value: 'last', label: 'Last check' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '3days', label: '3 days ago' },
  { value: '7days', label: '7 days ago' },
  { value: '14days', label: '14 days ago' },
  { value: '30days', label: '30 days ago' },
]

function getBaselineDate(option: string): string | undefined {
  if (option === 'last') return undefined // Use default (previous report)
  const days = {
    'yesterday': 1,
    '3days': 3,
    '7days': 7,
    '14days': 14,
    '30days': 30,
  }[option]
  if (days) {
    return format(subDays(new Date(), days), 'yyyy-MM-dd')
  }
  return undefined
}

export function Dashboard() {
  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [baselineOption, setBaselineOption] = useState<string>('last')

  const filters: AsinFilters = useMemo(() => ({
    startDate: dateRange?.from?.toISOString().split('T')[0],
    endDate: dateRange?.to?.toISOString().split('T')[0],
    baselineDate: getBaselineDate(baselineOption),
  }), [dateRange, baselineOption])

  const { data: asins, isLoading, isError, error, refetch } = useLatestAsins(filters)
  const { data: scraperStatus } = useScraperStatus()
  const deleteAsin = useDeleteAsin()
  const toggleSnooze = useToggleAsinSnooze()
  const startScraper = useStartScraper()
  const stopScraper = useStopScraper()
  const { isConnected, progress } = useSocket()

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedAsin, setSelectedAsin] = useState<AsinReport | null>(null)
  const [asinToDelete, setAsinToDelete] = useState<string | null>(null)

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')

  // Row selection state
  const [selectedRows, setSelectedRows] = useState<AsinReport[]>([])

  // Get unique sellers for the filter dropdown
  const uniqueSellers = useMemo(() => {
    if (!asins) return []
    const sellers = new Set(asins.map(a => a.seller).filter(Boolean))
    return Array.from(sellers).sort()
  }, [asins])

  // Filter the data based on selected filters
  const filteredData = useMemo(() => {
    if (!asins) return []

    return asins.filter(asin => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_stock' && asin.available !== true) return false
        if (statusFilter === 'unavailable' && asin.available !== false) return false
        if (statusFilter === 'snoozed' && !asin.snoozed) return false
        if (statusFilter === 'changed' && !asin.has_changes) return false
      }

      // Seller filter
      if (sellerFilter !== 'all' && asin.seller !== sellerFilter) return false

      return true
    })
  }, [asins, statusFilter, sellerFilter])

  const stats = useMemo(() => {
    if (!asins) return { total: 0, available: 0, unavailable: 0, snoozed: 0, changed: 0 }

    return {
      total: asins.length,
      available: asins.filter((a) => a.available === true).length,
      unavailable: asins.filter((a) => a.available === false).length,
      snoozed: asins.filter((a) => a.snoozed).length,
      changed: asins.filter((a) => a.has_changes).length,
    }
  }, [asins])

  const handleEdit = (asin: AsinReport) => {
    setSelectedAsin(asin)
    setEditModalOpen(true)
  }

  const handleDelete = (asin: string) => {
    setAsinToDelete(asin)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!asinToDelete) return
    await deleteAsin.mutateAsync(asinToDelete)
    setDeleteModalOpen(false)
    setAsinToDelete(null)
  }

  const handleToggleSnooze = async (asin: string) => {
    await toggleSnooze.mutateAsync(asin)
  }

  const handleRunChecker = () => {
    if (scraperStatus?.running) {
      stopScraper.mutate()
    } else {
      startScraper.mutate()
    }
  }

  const handleRunSelectedChecker = async () => {
    if (selectedRows.length === 0) return

    const selectedAsins = selectedRows.map(r => r.asin)

    try {
      const response = await fetch('/api/run-report-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asins: selectedAsins }),
      })

      if (response.ok) {
        setSelectedRows([])
      }
    } catch (err) {
      console.error('Failed to run checker on selected:', err)
    }
  }

  const handleRowSelectionChange = (rows: AsinReport[]) => {
    setSelectedRows(rows)
  }

  // CSV export columns
  const csvColumns = [
    { key: 'asin', header: 'ASIN' },
    { key: 'sku', header: 'SKU' },
    { key: 'title', header: 'Title' },
    { key: 'available', header: 'Available', accessor: (r: unknown) => { if (!isAsinReport(r)) return ''; return r.available ? 'Yes' : 'No' } },
    { key: 'seller', header: 'Seller' },
    { key: 'price', header: 'Price', accessor: (r: unknown) => { if (!isAsinReport(r)) return ''; return r.price?.toFixed(2) } },
    { key: 'price_change', header: 'Price Change', accessor: (r: unknown) => { if (!isAsinReport(r)) return ''; return r.price_change?.toFixed(2) } },
    { key: 'ranking', header: 'Rank' },
    { key: 'shipped_units', header: 'Shipped Units' },
    { key: 'shipped_revenue', header: 'Shipped Revenue' },
    { key: 'glance_views', header: 'Glance Views' },
    { key: 'received_quantity', header: 'Received Qty' },
    { key: 'inbound_quantity', header: 'Inbound Qty' },
    { key: 'last_po_date', header: 'Last PO Date' },
    { key: 'comment', header: 'Comment' },
    { key: 'check_date', header: 'Last Checked' },
  ]

  if (isError) {
    return (
      <PageWrapper>
        <PageHeader
          title="Dashboard"
          description="Overview of your Amazon product tracking"
        />
        <QueryError
          error={error}
          onRetry={() => refetch()}
          title="Failed to load products"
          description="There was a problem loading your product data. Please try again."
        />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Dashboard"
        description="Overview of your Amazon product tracking"
        actions={
          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="flex items-center gap-1 text-sm text-muted">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-success" />
                  <span className="hidden sm:inline">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-danger" />
                  <span className="hidden sm:inline">Disconnected</span>
                </>
              )}
            </div>

            <Button variant="outline" onClick={() => setUploadModalOpen(true)} aria-label="Import ASINs">
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="outline" onClick={() => setAddModalOpen(true)} aria-label="Add ASIN">
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add ASIN</span>
            </Button>
            <Button variant="outline" onClick={() => refetch()} aria-label="Refresh data">
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <CsvExportModal
              data={filteredData}
              columns={csvColumns}
              filename="dashboard-products"
            />
            <Button
              onClick={handleRunChecker}
              variant={scraperStatus?.running ? 'destructive' : 'default'}
              disabled={startScraper.isPending || stopScraper.isPending}
              aria-label={scraperStatus?.running ? 'Stop scraper' : 'Run scraper'}
            >
              {scraperStatus?.running ? (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Stop</span>
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Run Checker</span>
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Scraper Progress */}
      <ScraperProgress progress={progress} />

      {/* Info Banner - Sticky with lower z-index than calendar popover */}
      {(baselineOption !== 'last' || dateRange) && (
        <div className="sticky top-0 z-10 -mx-6 mb-4 bg-background px-6 pt-2 pb-2">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2 dark:bg-amber-950">
            <History className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Comparing changes since{' '}
              <strong>
                {baselineOption === 'last'
                  ? 'last check'
                  : BASELINE_OPTIONS.find(o => o.value === baselineOption)?.label?.toLowerCase() ?? baselineOption}
              </strong>
              {dateRange?.from && (
                <>
                  {' '}• Filtered:{' '}
                  <strong>{format(dateRange.from, 'MMM d, yyyy')}</strong>
                  {dateRange.to && (
                    <>
                      {' '}to{' '}
                      <strong>{format(dateRange.to, 'MMM d, yyyy')}</strong>
                    </>
                  )}
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <StatCardGrid columns={4}>
        <StatCard
          title="Total Products"
          value={stats.total}
          icon={<Package className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Available"
          value={stats.available}
          icon={<CheckCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Unavailable"
          value={stats.unavailable}
          icon={<XCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Snoozed"
          value={stats.snoozed}
          icon={<Clock className="h-6 w-6" />}
          isLoading={isLoading}
        />
      </StatCardGrid>

      {/* Filters and Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted" />
          <span className="text-sm text-muted">Filters:</span>
        </div>

        {/* Date Range Filter */}
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          placeholder="Select date range"
        />

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
            <SelectItem value="snoozed">Snoozed</SelectItem>
            <SelectItem value="changed">Changed</SelectItem>
          </SelectContent>
        </Select>

        {/* Seller Filter */}
        <Select value={sellerFilter} onValueChange={setSellerFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Seller" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sellers</SelectItem>
            {uniqueSellers.map(seller => (
              <SelectItem key={seller} value={String(seller)}>
                {seller}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Baseline Comparison Selector */}
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted" />
          <span className="text-sm text-muted">Changes since:</span>
          <Select value={baselineOption} onValueChange={setBaselineOption}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASELINE_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear filters */}
        {(statusFilter !== 'all' || sellerFilter !== 'all' || dateRange || baselineOption !== 'last') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all')
              setSellerFilter('all')
              setDateRange(undefined)
              setBaselineOption('last')
            }}
          >
            Clear filters
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Run on Selected button */}
        {selectedRows.length > 0 && (
          <Button onClick={handleRunSelectedChecker} variant="outline">
            <Play className="mr-2 h-4 w-4" />
            Run on {selectedRows.length} selected
          </Button>
        )}
      </div>

      {/* Products Table */}
      <div className="mt-4">
        <DashboardTable
          data={filteredData}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleSnooze={handleToggleSnooze}
          enableRowSelection
          onRowSelectionChange={handleRowSelectionChange}
        />
      </div>

      {/* Modals */}
      <AddAsinModal open={addModalOpen} onOpenChange={setAddModalOpen} />
      <EditAsinModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        asin={selectedAsin}
      />
      <ExcelUploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
      <ConfirmModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Product"
        description={`Are you sure you want to delete ${asinToDelete}? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteAsin.isPending}
      />
    </PageWrapper>
  )
}
