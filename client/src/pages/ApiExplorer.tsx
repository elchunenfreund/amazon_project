import { useState } from 'react'
import { Play, Copy, Check } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const API_ENDPOINTS = [
  { value: 'products', label: 'Products', method: 'GET', path: '/api/products' },
  { value: 'asins-latest', label: 'Latest ASINs', method: 'GET', path: '/api/asins/latest' },
  { value: 'vendor-reports', label: 'Vendor Reports', method: 'GET', path: '/api/vendor-reports' },
  { value: 'purchase-orders', label: 'Purchase Orders', method: 'GET', path: '/api/purchase-orders' },
  { value: 'catalog', label: 'Catalog Item', method: 'GET', path: '/api/catalog/:asin' },
  { value: 'sp-api-sync', label: 'Sync Reports', method: 'POST', path: '/api/sp-api/sync-reports' },
  { value: 'sp-api-orders', label: 'Sync Orders', method: 'POST', path: '/api/sp-api/sync-orders' },
]

export function ApiExplorer() {
  const [selectedEndpoint, setSelectedEndpoint] = useState('')
  const [asinParam, setAsinParam] = useState('')
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const currentEndpoint = API_ENDPOINTS.find((e) => e.value === selectedEndpoint)

  const handleExecute = async () => {
    if (!currentEndpoint) return

    setLoading(true)
    setError(null)
    setResponse(null)

    try {
      let url = currentEndpoint.path
      if (url.includes(':asin') && asinParam) {
        url = url.replace(':asin', asinParam)
      }

      const res = await fetch(url, {
        method: currentEndpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))

      if (!res.ok) {
        setError(`HTTP ${res.status}: ${res.statusText}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (response) {
      navigator.clipboard.writeText(response)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <PageWrapper>
      <PageHeader
        title="API Explorer"
        description="Test and explore Amazon SP-API endpoints"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>Select an endpoint and execute</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Endpoint</Label>
              <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an endpoint" />
                </SelectTrigger>
                <SelectContent>
                  {API_ENDPOINTS.map((endpoint) => (
                    <SelectItem key={endpoint.value} value={endpoint.value}>
                      <span className="font-mono text-xs mr-2 px-1 py-0.5 rounded bg-slate-100">
                        {endpoint.method}
                      </span>
                      {endpoint.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentEndpoint?.path.includes(':asin') && (
              <div className="space-y-2">
                <Label>ASIN</Label>
                <Input
                  placeholder="B08N5WRWNW"
                  value={asinParam}
                  onChange={(e) => setAsinParam(e.target.value)}
                />
              </div>
            )}

            {currentEndpoint && (
              <div className="rounded-md bg-slate-100 p-3">
                <p className="font-mono text-sm">
                  <span className="font-semibold text-accent">
                    {currentEndpoint.method}
                  </span>{' '}
                  {currentEndpoint.path.includes(':asin') && asinParam
                    ? currentEndpoint.path.replace(':asin', asinParam)
                    : currentEndpoint.path}
                </p>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleExecute}
              disabled={!selectedEndpoint || loading}
            >
              <Play className="mr-2 h-4 w-4" />
              {loading ? 'Executing...' : 'Execute Request'}
            </Button>
          </CardContent>
        </Card>

        {/* Response Panel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Response</CardTitle>
              <CardDescription>
                {error ? (
                  <span className="text-danger">{error}</span>
                ) : response ? (
                  'Request completed successfully'
                ) : (
                  'Execute a request to see the response'
                )}
              </CardDescription>
            </div>
            {response && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="max-h-[500px] overflow-auto rounded-md bg-slate-900 p-4">
              <pre className="text-sm text-green-400">
                {response ?? '// Response will appear here'}
              </pre>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documentation */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="products">
            <TabsList>
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="vendor">Vendor Reports</TabsTrigger>
              <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-4 space-y-4">
              <div>
                <h3 className="font-semibold">GET /api/products</h3>
                <p className="text-sm text-muted">Returns all tracked products</p>
              </div>
              <div>
                <h3 className="font-semibold">GET /api/asins/latest</h3>
                <p className="text-sm text-muted">Returns latest check data for all ASINs</p>
              </div>
              <div>
                <h3 className="font-semibold">GET /api/asins/:asin/history</h3>
                <p className="text-sm text-muted">Returns historical check data for a specific ASIN</p>
              </div>
            </TabsContent>

            <TabsContent value="vendor" className="mt-4 space-y-4">
              <div>
                <h3 className="font-semibold">GET /api/vendor-reports</h3>
                <p className="text-sm text-muted">Returns vendor analytics data. Supports query params: startDate, endDate, asin</p>
              </div>
              <div>
                <h3 className="font-semibold">POST /api/sp-api/sync-reports</h3>
                <p className="text-sm text-muted">Triggers sync of vendor reports from Amazon SP-API</p>
              </div>
            </TabsContent>

            <TabsContent value="orders" className="mt-4 space-y-4">
              <div>
                <h3 className="font-semibold">GET /api/purchase-orders</h3>
                <p className="text-sm text-muted">Returns purchase orders. Supports query params: startDate, endDate, state</p>
              </div>
              <div>
                <h3 className="font-semibold">GET /api/purchase-orders/:poNumber</h3>
                <p className="text-sm text-muted">Returns details for a specific purchase order including line items</p>
              </div>
              <div>
                <h3 className="font-semibold">POST /api/sp-api/sync-orders</h3>
                <p className="text-sm text-muted">Triggers sync of purchase orders from Amazon SP-API</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </PageWrapper>
  )
}
