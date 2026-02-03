import { useState, useMemo } from 'react'
import { DollarSign, Package, Eye, TrendingUp } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { StatCard, StatCardGrid } from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVendorReports, useVendorReportAsins, useSyncVendorReports } from '@/hooks'
import type { VendorReportFilters } from '@/lib/api'
import {
  AnalyticsFilters,
  AnalyticsCharts,
  AnalyticsTable,
} from '@/components/analytics'

export function Analytics() {
  const [filters, setFilters] = useState<VendorReportFilters>({})
  const { data: reports, isLoading } = useVendorReports(filters)
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

  return (
    <PageWrapper>
      <PageHeader
        title="Vendor Analytics"
        description="Sales, inventory, and traffic data from Amazon SP-API"
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
            <TabsTrigger value="table">Data Table</TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="mt-6">
            <AnalyticsCharts data={reports ?? []} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="table" className="mt-6">
            <AnalyticsTable data={reports ?? []} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </PageWrapper>
  )
}
