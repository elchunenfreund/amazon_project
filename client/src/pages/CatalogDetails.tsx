import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, RefreshCw, DollarSign, Package, Eye, TrendingUp, Boxes } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useCatalogItem, useRefreshCatalogItem, useVendorReportsByAsin } from '@/hooks'
import { getAmazonProductUrl } from '@/lib/api'

export function CatalogDetails() {
  const { asin } = useParams<{ asin: string }>()
  const { data: catalog, isLoading } = useCatalogItem(asin ?? '')
  const refreshCatalog = useRefreshCatalogItem()
  const { data: vendorReports, isLoading: vendorLoading } = useVendorReportsByAsin(asin ?? '')

  const handleRefresh = () => {
    if (asin) {
      refreshCatalog.mutate(asin)
    }
  }

  // Calculate vendor data summary
  const vendorSummary = useMemo(() => {
    if (!vendorReports || vendorReports.length === 0) {
      return null
    }

    // Get the latest report for current inventory
    const sortedReports = [...vendorReports].sort((a, b) =>
      b.report_date.localeCompare(a.report_date)
    )
    const latestReport = sortedReports[0]

    // Calculate totals
    const totalCogs = vendorReports.reduce((sum, r) => sum + (r.shipped_cogs ?? 0), 0)
    const totalShippedUnits = vendorReports.reduce((sum, r) => sum + (r.shipped_units ?? 0), 0)
    const totalOrderedUnits = vendorReports.reduce((sum, r) => sum + (r.ordered_units ?? 0), 0)
    const totalRevenue = vendorReports.reduce((sum, r) => sum + (r.ordered_revenue ?? 0), 0)
    const totalViews = vendorReports.reduce((sum, r) => sum + (r.glance_views ?? 0), 0)

    // Calculate average conversion rate
    const conversions = vendorReports.filter(r => r.conversion_rate != null).map(r => r.conversion_rate!)
    const avgConversion = conversions.length > 0
      ? conversions.reduce((sum, c) => sum + c, 0) / conversions.length
      : null

    // Date range
    const firstDate = sortedReports[sortedReports.length - 1]?.report_date
    const lastDate = sortedReports[0]?.report_date

    return {
      totalCogs,
      totalShippedUnits,
      totalOrderedUnits,
      totalRevenue,
      totalViews,
      avgConversion,
      currentInventory: latestReport?.sellable_on_hand_inventory ?? null,
      reportCount: vendorReports.length,
      firstDate,
      lastDate,
    }
  }, [vendorReports])

  return (
    <PageWrapper>
      <PageHeader
        title={`Catalog: ${asin}`}
        description={catalog?.title ?? 'Product catalog information from Amazon'}
        actions={
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshCatalog.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshCatalog.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" asChild>
              <a
                href={getAmazonProductUrl(asin ?? '')}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on Amazon
              </a>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="p-6">
              <Skeleton className="aspect-square w-full" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : !catalog ? (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center gap-4">
            <p className="text-muted">No catalog data available for this ASIN</p>
            <Button onClick={handleRefresh} disabled={refreshCatalog.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshCatalog.isPending ? 'animate-spin' : ''}`} />
              Fetch Catalog Data
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Product Image */}
            <Card className="lg:col-span-1">
              <CardContent className="p-6">
                {catalog.image_url ? (
                  <img
                    src={catalog.image_url}
                    alt={catalog.title ?? 'Product image'}
                    className="aspect-square w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-slate-100">
                    <p className="text-muted">No image available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Product Details */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Product Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailRow label="ASIN" value={catalog.asin} mono />
                <Separator />
                <DetailRow label="Title" value={catalog.title} />
                <Separator />
                <DetailRow label="Brand" value={catalog.brand} />
                <Separator />
                <DetailRow label="Manufacturer" value={catalog.manufacturer} />
                <Separator />
                <DetailRow label="Item Name" value={catalog.item_name} />
                <Separator />
                <DetailRow label="Product Type" value={catalog.product_type} />
                <Separator />
                <DetailRow
                  label="Last Updated"
                  value={
                    catalog.updated_at
                      ? new Date(catalog.updated_at).toLocaleString()
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          </div>

          {/* Vendor Analytics Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Vendor Analytics
                {vendorSummary && (
                  <span className="text-sm font-normal text-muted">
                    ({vendorSummary.reportCount} reports from {vendorSummary.firstDate} to {vendorSummary.lastDate})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendorLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-lg">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-24" />
                    </div>
                  ))}
                </div>
              ) : !vendorSummary ? (
                <p className="text-muted text-center py-8">
                  No vendor analytics data available for this ASIN
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <StatBox
                    icon={<DollarSign className="h-5 w-5 text-blue-500" />}
                    label="Total COGS"
                    value={`$${vendorSummary.totalCogs.toLocaleString()}`}
                  />
                  <StatBox
                    icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
                    label="Total Revenue"
                    value={`$${vendorSummary.totalRevenue.toLocaleString()}`}
                  />
                  <StatBox
                    icon={<Package className="h-5 w-5 text-purple-500" />}
                    label="Shipped Units"
                    value={vendorSummary.totalShippedUnits.toLocaleString()}
                  />
                  <StatBox
                    icon={<Package className="h-5 w-5 text-pink-500" />}
                    label="Ordered Units"
                    value={vendorSummary.totalOrderedUnits.toLocaleString()}
                  />
                  <StatBox
                    icon={<Eye className="h-5 w-5 text-orange-500" />}
                    label="Glance Views"
                    value={vendorSummary.totalViews.toLocaleString()}
                  />
                  <StatBox
                    icon={<TrendingUp className="h-5 w-5 text-cyan-500" />}
                    label="Avg Conversion"
                    value={vendorSummary.avgConversion != null
                      ? `${(vendorSummary.avgConversion * 100).toFixed(2)}%`
                      : '-'
                    }
                  />
                  {vendorSummary.currentInventory != null && (
                    <StatBox
                      icon={<Boxes className="h-5 w-5 text-amber-500" />}
                      label="Current Inventory"
                      value={vendorSummary.currentInventory.toLocaleString()}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageWrapper>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className={`text-sm ${mono ? 'font-mono' : ''} ${!value ? 'text-muted' : ''}`}>
        {value ?? '-'}
      </span>
    </div>
  )
}

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}
