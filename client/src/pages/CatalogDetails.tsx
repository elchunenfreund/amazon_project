import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { useCatalogItem, useRefreshCatalogItem } from '@/hooks'

export function CatalogDetails() {
  const { asin } = useParams<{ asin: string }>()
  const { data: catalog, isLoading } = useCatalogItem(asin ?? '')
  const refreshCatalog = useRefreshCatalogItem()

  const handleRefresh = () => {
    if (asin) {
      refreshCatalog.mutate(asin)
    }
  }

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
                href={`https://www.amazon.com/dp/${asin}`}
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
