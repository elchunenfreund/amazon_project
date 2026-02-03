import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { VendorReport } from '@/lib/api'

interface AnalyticsChartsProps {
  data: VendorReport[]
  isLoading?: boolean
}

export function AnalyticsCharts({ data, isLoading = false }: AnalyticsChartsProps) {
  const [selectedAsin, setSelectedAsin] = useState<string>('all')

  // Get unique ASINs for the dropdown
  const uniqueAsins = useMemo(() => {
    const asins = [...new Set(data.map(r => r.asin))].sort()
    return asins
  }, [data])

  // Filter data by selected ASIN
  const filteredData = useMemo(() => {
    if (selectedAsin === 'all') return data
    return data.filter(r => r.asin === selectedAsin)
  }, [data, selectedAsin])

  const chartData = useMemo(() => {
    if (!filteredData.length) return []

    // Group by date and aggregate
    const grouped = filteredData.reduce(
      (acc, report) => {
        const date = report.report_date
        if (!acc[date]) {
          acc[date] = {
            date,
            shippedCogs: 0,
            shippedUnits: 0,
            orderedUnits: 0,
            glanceViews: 0,
            orderedRevenue: 0,
          }
        }
        acc[date].shippedCogs += report.shipped_cogs ?? 0
        acc[date].shippedUnits += report.shipped_units ?? 0
        acc[date].orderedUnits += report.ordered_units ?? 0
        acc[date].glanceViews += report.glance_views ?? 0
        acc[date].orderedRevenue += report.ordered_revenue ?? 0
        return acc
      },
      {} as Record<string, { date: string; shippedCogs: number; shippedUnits: number; orderedUnits: number; glanceViews: number; orderedRevenue: number }>
    )

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredData])

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
            </CardHeader>
            <CardContent>
              <div className="h-64 animate-pulse rounded bg-slate-100" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!chartData.length) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-muted">No data available for the selected filters</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ASIN Selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">View charts for:</span>
        <Select value={selectedAsin} onValueChange={setSelectedAsin}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="All ASINs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ASINs (Aggregated)</SelectItem>
            {uniqueAsins.map(asin => (
              <SelectItem key={asin} value={asin}>
                {asin}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedAsin !== 'all' && (
          <span className="text-sm text-muted">
            Showing data for {selectedAsin}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
      {/* Shipped COGS Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Shipped COGS</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [`$${(value as number).toLocaleString()}`, 'COGS']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Line
                type="monotone"
                dataKey="shippedCogs"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Units Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => [(value as number).toLocaleString(), name]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Legend />
              <Bar dataKey="shippedUnits" name="Shipped" fill="#2563eb" />
              <Bar dataKey="orderedUnits" name="Ordered" fill="#059669" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Glance Views Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Glance Views (Traffic)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [(value as number).toLocaleString(), 'Views']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Line
                type="monotone"
                dataKey="glanceViews"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Revenue Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Ordered Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [`$${(value as number).toLocaleString()}`, 'Revenue']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Line
                type="monotone"
                dataKey="orderedRevenue"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
