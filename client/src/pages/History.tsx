import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { PageWrapper, PageHeader } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AvailabilityBadge } from '@/components/shared/StatusBadge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsinHistory } from '@/hooks'
import { getAmazonProductUrl } from '@/lib/api'

export function History() {
  const { asin } = useParams<{ asin: string }>()
  const { data: history, isLoading } = useAsinHistory(asin ?? '')

  const chartData = useMemo(() => {
    if (!history) return []
    return history
      .map((report) => ({
        date: `${report.check_date} ${report.check_time?.slice(0, 5) ?? ''}`,
        price: report.price,
        ranking: report.ranking,
        available: report.available ? 1 : 0,
      }))
      .reverse()
  }, [history])

  const latestReport = history?.[0]

  return (
    <PageWrapper>
      <PageHeader
        title={`History: ${asin}`}
        description={latestReport?.title ?? 'Historical data for this product'}
        actions={
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
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
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-96" />
            </CardContent>
          </Card>
        </div>
      ) : !history || history.length === 0 ? (
        <Card>
          <CardContent className="flex h-64 items-center justify-center">
            <p className="text-muted">No historical data available for this ASIN</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Price Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Price History</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.split(' ')[0]?.slice(5) ?? ''}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip
                      formatter={(value) => [`$${(value as number)?.toFixed(2) ?? '-'}`, 'Price']}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Ranking Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Sales Rank History</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.split(' ')[0]?.slice(5) ?? ''}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      reversed
                      tickFormatter={(value) => `#${value?.toLocaleString() ?? ''}`}
                    />
                    <Tooltip
                      formatter={(value) => [`#${(value as number)?.toLocaleString() ?? '-'}`, 'Rank']}
                    />
                    <Line
                      type="monotone"
                      dataKey="ranking"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Data Table */}
          <Card>
            <CardHeader>
              <CardTitle>Check History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Rank</TableHead>
                      <TableHead>Buy Box</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          {format(new Date(report.check_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-muted">
                          {report.check_time?.slice(0, 5) ?? '-'}
                        </TableCell>
                        <TableCell>
                          <AvailabilityBadge available={report.available} />
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {report.seller ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {report.price ? `$${report.price.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {report.ranking ? `#${report.ranking.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {report.buy_box ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageWrapper>
  )
}
