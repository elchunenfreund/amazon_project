import { useState, useMemo } from 'react'
import { DollarSign, Package, Eye, TrendingUp, ExternalLink } from 'lucide-react'
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
  totalCogs: number
  totalUnits: number
  totalViews: number
  totalRevenue: number
  avgConversion: number
  inventory: number
  reportCount: number
}

export function Analytics() {
  const [filters, setFilters] = useState<VendorReportFilters>({})
  const { data: reports, isLoading, isError, error, refetch } = useVendorReports(filters)
  const { data: asins } = useVendorReportAsins()
  const syncReports = useSyncVendorReports()

  const stats = useMemo(() => {
    if (!reports) return { totalCogs: 0, totalUnits: 0, totalViews: 0, avgConversion: 0 }

    const totalCogs = reports.reduce((sum, r) => sum + (r.shipped_cogs ?? 0), 0)
    const totalUnits = reports.reduce((sum, r) => sum + (r.shipped_units ?? 0), 0)
    const totalViews = reports.reduce((sum, r) => sum + (r.glance_views ?? 0), 0)
    const conversions = reports.filter((r) => r.conversion_rate).map((r) => r.conversion_rate!)
    const avgConversion = conversions.length > 0
      ? conversions.reduce((sum, c) => sum + c, 0) / conversions.length
      : 0

    return { totalCogs, totalUnits, totalViews, avgConversion }
  }, [reports])

  // CSV export columns for vendor reports
  const reportsCsvColumns = [
    { key: 'report_date', header: 'Date' },
    { key: 'asin', header: 'ASIN' },
    { key: 'report_type', header: 'Report Type' },
    { key: 'shipped_cogs', header: 'Shipped COGS' },
    { key: 'shipped_units', header: 'Shipped Units' },
    { key: 'ordered_units', header: 'Ordered Units' },
    { key: 'ordered_revenue', header: 'Ordered Revenue' },
    { key: 'sellable_on_hand_inventory', header: 'Inventory' },
    { key: 'glance_views', header: 'Glance Views' },
    { key: 'conversion_rate', header: 'Conversion Rate', accessor: (r: unknown) => { if (!isVendorReport(r)) return ''; const v = r.conversion_rate; return v ? `${(v * 100).toFixed(2)}%` : '' } },
  ]

  // CSV export columns for ASIN summary
  const asinCsvColumns = [
    { key: 'asin', header: 'ASIN' },
    { key: 'totalRevenue', header: 'Total Revenue' },
    { key: 'totalCogs', header: 'Total COGS' },
    { key: 'totalUnits', header: 'Units Shipped' },
    { key: 'totalViews', header: 'Glance Views' },
    { key: 'avgConversion', header: 'Avg Conversion', accessor: (r: unknown) => { if (!isAsinSummary(r)) return ''; return `${(r.avgConversion * 100).toFixed(2)}%` } },
    { key: 'inventory', header: 'Current Inventory' },
  ]

  // Per-ASIN summary
  const asinSummary = useMemo<AsinSummary[]>(() => {
    if (!reports) return []

    const summaryMap = new Map<string, AsinSummary>()

    for (const report of reports) {
      const existing = summaryMap.get(report.asin) || {
        asin: report.asin,
        totalCogs: 0,
        totalUnits: 0,
        totalViews: 0,
        totalRevenue: 0,
        avgConversion: 0,
        inventory: 0,
        reportCount: 0,
      }

      existing.totalCogs += report.shipped_cogs ?? 0
      existing.totalUnits += report.shipped_units ?? 0
      existing.totalViews += report.glance_views ?? 0
      existing.totalRevenue += report.ordered_revenue ?? 0
      existing.inventory = report.sellable_on_hand_inventory ?? existing.inventory
      if (report.conversion_rate) {
        existing.avgConversion = (existing.avgConversion * existing.reportCount + report.conversion_rate) / (existing.reportCount + 1)
      }
      existing.reportCount++

      summaryMap.set(report.asin, existing)
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
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
      accessorKey: 'totalUnits',
      header: 'Units Shipped',
      cell: ({ row }) => row.original.totalUnits.toLocaleString(),
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
          title="Shipped Units"
          value={stats.totalUnits.toLocaleString()}
          icon={<Package className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Glance Views"
          value={stats.totalViews.toLocaleString()}
          icon={<Eye className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Avg Conversion"
          value={`${(stats.avgConversion * 100).toFixed(2)}%`}
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
