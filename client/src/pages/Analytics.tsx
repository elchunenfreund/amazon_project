import { useState, useMemo } from 'react'
import { DollarSign, Eye, TrendingUp, ExternalLink, Calendar, ShoppingCart } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { ColumnDef } from '@tanstack/react-table'
import { PageWrapper, PageHeader } from '@/components/layout'
import { StatCard, StatCardGrid, DataTable, CsvExportModal, QueryError } from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVendorReports, useVendorReportAsins, useSyncVendorReports } from '@/hooks'
import { getAmazonProductUrl } from '@/lib/api'
import type { VendorReportFilters } from '@/lib/api'
import { isVendorReport, isAsinSummary } from '@/lib/type-guards'
import {
  AnalyticsFilters,
  AnalyticsCharts,
  AnalyticsTable,
} from '@/components/analytics'

interface AsinSummary {
  asin: string
  title?: string
  vendor_sku?: string
  totalCogs: number
  totalShippedUnits: number
  totalOrderedUnits: number
  totalViews: number
  totalRevenue: number
  avgConversion: number
  inventory: number
  reportCount: number
}

export function Analytics() {
  // Start with no date filter to show all data - user can filter as needed
  const [filters, setFilters] = useState<VendorReportFilters>({})

  // For display purposes only
  const hasDateFilter = filters.startDate || filters.endDate

  const { data: reports, isLoading, isError, error, refetch } = useVendorReports(filters)
  // Pass date filters to asins query so dropdown only shows ASINs with data in the selected range
  const { data: asins } = useVendorReportAsins({ startDate: filters.startDate, endDate: filters.endDate })
  const syncReports = useSyncVendorReports()

  const stats = useMemo(() => {
    if (!reports) return { totalCogs: 0, totalShippedUnits: 0, totalOrderedUnits: 0, totalViews: 0, avgConversion: 0 }

    const totalCogs = reports.reduce((sum, r) => sum + (r.shipped_cogs ?? 0), 0)
    const totalShippedUnits = reports.reduce((sum, r) => sum + (r.shipped_units ?? 0), 0)
    const totalOrderedUnits = reports.reduce((sum, r) => sum + (r.ordered_units ?? 0), 0)
    const totalViews = reports.reduce((sum, r) => sum + (r.glance_views ?? 0), 0)

    // Calculate conversion rate from totals: Ordered Units / Glance Views
    // This is more accurate than averaging individual conversion rates
    const avgConversion = totalViews > 0 ? totalOrderedUnits / totalViews : 0

    return { totalCogs, totalShippedUnits, totalOrderedUnits, totalViews, avgConversion }
  }, [reports])

  // CSV export columns for vendor reports
  const reportsCsvColumns = [
    { key: 'report_date', header: 'Date' },
    { key: 'asin', header: 'ASIN' },
    { key: 'vendor_sku', header: 'SKU' },
    { key: 'title', header: 'Title' },
    { key: 'report_type', header: 'Report Type' },
    { key: 'shipped_cogs', header: 'Shipped COGS' },
    { key: 'shipped_units', header: 'Shipped Units' },
    { key: 'ordered_units', header: 'Ordered Units' },
    { key: 'ordered_revenue', header: 'Ordered Revenue' },
    { key: 'sellable_on_hand_inventory', header: 'Inventory' },
    { key: 'glance_views', header: 'Glance Views' },
    { key: 'conversion_rate', header: 'Conversion Rate', accessor: (r: unknown) => { if (!isVendorReport(r)) return ''; const v = r.conversion_rate; return v ? `${(v * 100).toFixed(2)}%` : '' } },
    { key: 'sell_through_rate', header: 'Sell-Through Rate', accessor: (r: unknown) => { if (!isVendorReport(r)) return ''; const v = r.sell_through_rate; return v ? `${(v * 100).toFixed(1)}%` : '' } },
    { key: 'vendor_confirmation_rate', header: 'PO Confirm Rate', accessor: (r: unknown) => { if (!isVendorReport(r)) return ''; const v = r.vendor_confirmation_rate; return v ? `${(v * 100).toFixed(1)}%` : '' } },
    { key: 'open_purchase_order_units', header: 'Open PO Units' },
    { key: 'receive_fill_rate', header: 'Fill Rate', accessor: (r: unknown) => { if (!isVendorReport(r)) return ''; const v = r.receive_fill_rate; return v ? `${(v * 100).toFixed(1)}%` : '' } },
    { key: 'average_vendor_lead_time_days', header: 'Lead Time (days)' },
    { key: 'net_received_inventory_units', header: 'Net Received Units' },
    { key: 'unsellable_on_hand_inventory', header: 'Unsellable Units' },
    { key: 'aged_90_plus_inventory_units', header: 'Aged 90+ Units' },
    { key: 'customer_returns', header: 'Returns' },
  ]

  // CSV export columns for ASIN summary
  const asinCsvColumns = [
    { key: 'asin', header: 'ASIN' },
    { key: 'vendor_sku', header: 'SKU' },
    { key: 'title', header: 'Title' },
    { key: 'totalRevenue', header: 'Total Revenue' },
    { key: 'totalCogs', header: 'Total COGS' },
    { key: 'totalOrderedUnits', header: 'Ordered Units' },
    { key: 'totalShippedUnits', header: 'Shipped Units' },
    { key: 'totalViews', header: 'Glance Views' },
    { key: 'avgConversion', header: 'Conversion Rate', accessor: (r: unknown) => { if (!isAsinSummary(r)) return ''; return `${(r.avgConversion * 100).toFixed(2)}%` } },
    { key: 'inventory', header: 'Current Inventory' },
  ]

  // Per-ASIN summary
  const asinSummary = useMemo<AsinSummary[]>(() => {
    if (!reports) return []

    const summaryMap = new Map<string, AsinSummary>()

    for (const report of reports) {
      const existing = summaryMap.get(report.asin) || {
        asin: report.asin,
        title: undefined,
        vendor_sku: undefined,
        totalCogs: 0,
        totalShippedUnits: 0,
        totalOrderedUnits: 0,
        totalViews: 0,
        totalRevenue: 0,
        avgConversion: 0,
        inventory: 0,
        reportCount: 0,
      }

      // Capture title and vendor_sku from first report that has them
      if (report.title && !existing.title) existing.title = report.title
      if (report.vendor_sku && !existing.vendor_sku) existing.vendor_sku = report.vendor_sku
      existing.totalCogs += report.shipped_cogs ?? 0
      existing.totalShippedUnits += report.shipped_units ?? 0
      existing.totalOrderedUnits += report.ordered_units ?? 0
      existing.totalViews += report.glance_views ?? 0
      existing.totalRevenue += report.ordered_revenue ?? 0
      existing.inventory = report.sellable_on_hand_inventory ?? existing.inventory
      existing.reportCount++

      summaryMap.set(report.asin, existing)
    }

    // Calculate conversion rate from totals for each ASIN
    return Array.from(summaryMap.values())
      .map(item => ({
        ...item,
        avgConversion: item.totalViews > 0 ? item.totalOrderedUnits / item.totalViews : 0
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [reports])

  const asinColumns = useMemo<ColumnDef<AsinSummary>[]>(() => [
    {
      accessorKey: 'asin',
      header: 'ASIN',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-medium">{row.original.asin}</span>
          <a
            href={getAmazonProductUrl(row.original.asin)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-accent"
            aria-label={`Open ${row.original.asin} on Amazon (opens in new tab)`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      ),
    },
    {
      accessorKey: 'vendor_sku',
      header: 'SKU',
      cell: ({ row }) => {
        const value = row.original.vendor_sku
        return value ? <span className="font-mono text-xs">{value}</span> : '-'
      },
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => {
        const value = row.original.title
        return value ? (
          <span className="max-w-[200px] truncate block" title={value}>
            {value}
          </span>
        ) : '-'
      },
    },
    {
      accessorKey: 'totalRevenue',
      header: 'Total Revenue',
      cell: ({ row }) => `$${row.original.totalRevenue.toLocaleString()}`,
    },
    {
      accessorKey: 'totalCogs',
      header: 'Total COGS',
      cell: ({ row }) => `$${row.original.totalCogs.toLocaleString()}`,
    },
    {
      accessorKey: 'totalOrderedUnits',
      header: 'Ordered Units',
      cell: ({ row }) => row.original.totalOrderedUnits.toLocaleString(),
    },
    {
      accessorKey: 'totalShippedUnits',
      header: 'Shipped Units',
      cell: ({ row }) => row.original.totalShippedUnits.toLocaleString(),
    },
    {
      accessorKey: 'totalViews',
      header: 'Glance Views',
      cell: ({ row }) => row.original.totalViews.toLocaleString(),
    },
    {
      accessorKey: 'avgConversion',
      header: 'Avg Conv. Rate',
      cell: ({ row }) => `${(row.original.avgConversion * 100).toFixed(2)}%`,
    },
    {
      accessorKey: 'inventory',
      header: 'Current Inventory',
      cell: ({ row }) => row.original.inventory.toLocaleString(),
    },
  ], [])

  if (isError) {
    return (
      <PageWrapper>
        <PageHeader
          title="Vendor Analytics"
          description="Sales, inventory, and traffic data from Amazon SP-API"
        />
        <QueryError
          error={error}
          onRetry={() => refetch()}
          title="Failed to load analytics"
          description="There was a problem loading vendor analytics data. Please try again."
        />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Vendor Analytics"
        description="Sales, inventory, and traffic data from Amazon SP-API"
        actions={
          <div className="flex gap-2">
            <CsvExportModal
              data={asinSummary}
              columns={asinCsvColumns}
              filename="analytics-by-asin"
            />
            <CsvExportModal
              data={reports ?? []}
              columns={reportsCsvColumns}
              filename="analytics-full"
            />
          </div>
        }
      />

      {/* Date Range Banner - Sticky with lower z-index than calendar popover */}
      <div className="sticky top-0 z-10 -mx-6 mb-4 bg-background px-6 pt-2 pb-2">
        <div className="flex flex-col gap-1 rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-950">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {hasDateFilter ? (
                <>
                  Showing data from{' '}
                  <strong>
                    {filters.startDate
                      ? `${format(parseISO(filters.startDate), 'EEEE, MMM d, yyyy')}`
                      : 'beginning'}
                  </strong>
                  {' '}to{' '}
                  <strong>
                    {filters.endDate
                      ? `${format(parseISO(filters.endDate), 'EEEE, MMM d, yyyy')}`
                      : 'now'}
                  </strong>
                  {filters.startDate && filters.endDate && (
                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                      ({Math.ceil((parseISO(filters.endDate).getTime() - parseISO(filters.startDate).getTime()) / (1000 * 60 * 60 * 24 * 7))} week{Math.ceil((parseISO(filters.endDate).getTime() - parseISO(filters.startDate).getTime()) / (1000 * 60 * 60 * 24 * 7)) !== 1 ? 's' : ''})
                    </span>
                  )}
                </>
              ) : (
                <strong>Showing all available data</strong>
              )}
            </span>
          </div>
          <p className="text-xs text-blue-600/80 dark:text-blue-400/80 ml-6">
            Amazon provides aggregated weekly data (Sunday - Saturday). Only complete weeks can be selected.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-8">
        <AnalyticsFilters
          asins={asins ?? []}
          onFilterChange={setFilters}
          onSync={() => syncReports.mutate()}
          isSyncing={syncReports.isPending}
        />
      </div>

      {/* Stats Cards */}
      <StatCardGrid columns={4}>
        <StatCard
          title="Total COGS"
          value={`$${stats.totalCogs.toLocaleString()}`}
          icon={<DollarSign className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Ordered Units"
          value={stats.totalOrderedUnits.toLocaleString()}
          description={`Shipped: ${stats.totalShippedUnits.toLocaleString()}`}
          icon={<ShoppingCart className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Glance Views"
          value={stats.totalViews.toLocaleString()}
          icon={<Eye className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Conversion Rate"
          value={`${(stats.avgConversion * 100).toFixed(2)}%`}
          description="Ordered ÷ Views"
          icon={<TrendingUp className="h-6 w-6" />}
          isLoading={isLoading}
        />
      </StatCardGrid>

      {/* Charts and Table */}
      <div className="mt-8">
        <Tabs defaultValue="charts">
          <TabsList>
            <TabsTrigger value="charts">Charts</TabsTrigger>
            <TabsTrigger value="by-asin">By ASIN</TabsTrigger>
            <TabsTrigger value="table">Full Data</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="mt-6">
            <AnalyticsCharts data={reports ?? []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="by-asin" className="mt-6">
            <DataTable
              columns={asinColumns}
              data={asinSummary}
              isLoading={isLoading}
              searchPlaceholder="Search by ASIN..."
              searchColumn="asin"
              enableColumnVisibility
              pageSize={20}
            />
          </TabsContent>

          <TabsContent value="table" className="mt-6">
            <AnalyticsTable data={reports ?? []} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </PageWrapper>
  )
}
