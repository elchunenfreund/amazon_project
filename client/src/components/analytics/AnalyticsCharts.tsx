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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { VendorReport } from '@/lib/api'

interface AnalyticsChartsProps {
  data: VendorReport[]
  isLoading?: boolean
}

type ChartMode = 'combined' | 'individual'

// Color palette for ASINs when comparing
const ASIN_COLORS = [
  '#2563eb', // blue
  '#059669', // green
  '#dc2626', // red
  '#7c3aed', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#65a30d', // lime
]

export function AnalyticsCharts({ data, isLoading = false }: AnalyticsChartsProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('individual')
  const [selectedAsins, setSelectedAsins] = useState<string[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState({
    shippedCogs: true,
    orderedRevenue: true,
    shippedUnits: false,
    orderedUnits: false,
    glanceViews: false,
    conversionRate: false,
  })

  // Get unique ASINs for the dropdown
  const uniqueAsins = useMemo(() => {
    const asins = [...new Set(data.map(r => r.asin))].sort()
    return asins
  }, [data])

  // Toggle ASIN selection
  const toggleAsin = (asin: string) => {
    setSelectedAsins(prev =>
      prev.includes(asin)
        ? prev.filter(a => a !== asin)
        : [...prev, asin]
    )
  }

  // Toggle metric selection
  const toggleMetric = (metric: keyof typeof selectedMetrics) => {
    setSelectedMetrics(prev => ({ ...prev, [metric]: !prev[metric] }))
  }

  // Select/deselect all ASINs
  const selectAllAsins = () => {
    if (selectedAsins.length === uniqueAsins.length) {
      setSelectedAsins([])
    } else {
      setSelectedAsins(uniqueAsins)
    }
  }

  // Determine which Y-axis to use based on selected metrics
  const hasCurrencyMetric = selectedMetrics.shippedCogs || selectedMetrics.orderedRevenue
  const hasUnitMetric = selectedMetrics.shippedUnits || selectedMetrics.orderedUnits || selectedMetrics.glanceViews
  const hasPercentMetric = selectedMetrics.conversionRate
  const hasAnyMetricSelected = Object.values(selectedMetrics).some(v => v)

  // Prepare aggregated chart data (for combined/all view)
  const aggregatedChartData = useMemo(() => {
    if (!data.length) return []

    const filteredData = selectedAsins.length > 0
      ? data.filter(r => selectedAsins.includes(r.asin))
      : data

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
            conversionRates: [] as number[],
          }
        }
        acc[date].shippedCogs += report.shipped_cogs ?? 0
        acc[date].shippedUnits += report.shipped_units ?? 0
        acc[date].orderedUnits += report.ordered_units ?? 0
        acc[date].glanceViews += report.glance_views ?? 0
        acc[date].orderedRevenue += report.ordered_revenue ?? 0
        if (report.conversion_rate) {
          acc[date].conversionRates.push(report.conversion_rate)
        }
        return acc
      },
      {} as Record<string, { date: string; shippedCogs: number; shippedUnits: number; orderedUnits: number; glanceViews: number; orderedRevenue: number; conversionRates: number[] }>
    )

    return Object.values(grouped)
      .map(d => ({
        date: d.date,
        shippedCogs: d.shippedCogs,
        shippedUnits: d.shippedUnits,
        orderedUnits: d.orderedUnits,
        glanceViews: d.glanceViews,
        orderedRevenue: d.orderedRevenue,
        conversionRate: d.conversionRates.length > 0
          ? d.conversionRates.reduce((a, b) => a + b, 0) / d.conversionRates.length
          : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [data, selectedAsins])

  // Prepare per-ASIN chart data for comparison mode
  const perAsinChartData = useMemo(() => {
    if (!data.length || selectedAsins.length === 0) return []

    // Group by date, with per-ASIN values
    const dateMap: Record<string, Record<string, number | null>> = {}

    for (const report of data) {
      if (!selectedAsins.includes(report.asin)) continue

      const date = report.report_date
      if (!dateMap[date]) {
        dateMap[date] = { date: date as unknown as number }
      }

      // Store values per ASIN
      dateMap[date][`${report.asin}_cogs`] = report.shipped_cogs ?? null
      dateMap[date][`${report.asin}_revenue`] = report.ordered_revenue ?? null
      dateMap[date][`${report.asin}_shippedUnits`] = report.shipped_units ?? null
      dateMap[date][`${report.asin}_orderedUnits`] = report.ordered_units ?? null
      dateMap[date][`${report.asin}_views`] = report.glance_views ?? null
      dateMap[date][`${report.asin}_conversion`] = report.conversion_rate ?? null
    }

    return Object.values(dateMap).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    )
  }, [data, selectedAsins])

  // Individual chart data (same as before for backwards compatibility)
  const individualChartData = useMemo(() => {
    if (!data.length) return []

    const filteredData = selectedAsins.length > 0
      ? data.filter(r => selectedAsins.includes(r.asin))
      : data

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
  }, [data, selectedAsins])

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

  if (!data.length) {
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
      {/* Chart Mode Toggle */}
      <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-lg">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium">Chart Mode:</span>
          <div className="flex gap-2">
            <Button
              variant={chartMode === 'individual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartMode('individual')}
            >
              Individual Charts
            </Button>
            <Button
              variant={chartMode === 'combined' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartMode('combined')}
            >
              Combined Chart
            </Button>
          </div>
        </div>

        {/* ASIN Selection */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">Compare ASINs:</span>
          <Button variant="outline" size="sm" onClick={selectAllAsins}>
            {selectedAsins.length === uniqueAsins.length ? 'Deselect All' : 'Select All'}
          </Button>
          <div className="flex flex-wrap gap-2">
            {uniqueAsins.map((asin, idx) => (
              <Badge
                key={asin}
                variant={selectedAsins.includes(asin) ? 'default' : 'outline'}
                className="cursor-pointer"
                style={selectedAsins.includes(asin) ? { backgroundColor: ASIN_COLORS[idx % ASIN_COLORS.length] } : {}}
                onClick={() => toggleAsin(asin)}
              >
                {asin}
              </Badge>
            ))}
          </div>
          {selectedAsins.length === 0 && (
            <span className="text-sm text-muted">(All ASINs aggregated)</span>
          )}
        </div>

        {/* Metric Selection (for combined mode) */}
        {chartMode === 'combined' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Metrics:</span>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-cogs"
                checked={selectedMetrics.shippedCogs}
                onCheckedChange={() => toggleMetric('shippedCogs')}
              />
              <Label htmlFor="metric-cogs" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                COGS
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-revenue"
                checked={selectedMetrics.orderedRevenue}
                onCheckedChange={() => toggleMetric('orderedRevenue')}
              />
              <Label htmlFor="metric-revenue" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Revenue
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-shipped"
                checked={selectedMetrics.shippedUnits}
                onCheckedChange={() => toggleMetric('shippedUnits')}
              />
              <Label htmlFor="metric-shipped" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                Shipped Units
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-ordered"
                checked={selectedMetrics.orderedUnits}
                onCheckedChange={() => toggleMetric('orderedUnits')}
              />
              <Label htmlFor="metric-ordered" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-pink-500" />
                Ordered Units
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-views"
                checked={selectedMetrics.glanceViews}
                onCheckedChange={() => toggleMetric('glanceViews')}
              />
              <Label htmlFor="metric-views" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                Traffic
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="metric-conversion"
                checked={selectedMetrics.conversionRate}
                onCheckedChange={() => toggleMetric('conversionRate')}
              />
              <Label htmlFor="metric-conversion" className="cursor-pointer text-xs flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                Conversion %
              </Label>
            </div>
          </div>
        )}
      </div>

      {/* Combined Chart Mode */}
      {chartMode === 'combined' && (
        <Card>
          <CardHeader>
            <CardTitle>
              Combined Metrics
              {selectedAsins.length > 0 && selectedAsins.length < uniqueAsins.length && (
                <span className="text-sm font-normal text-muted ml-2">
                  ({selectedAsins.length} ASIN{selectedAsins.length > 1 ? 's' : ''} selected)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAnyMetricSelected ? (
              <div className="h-64 flex items-center justify-center text-muted text-sm">
                Select at least one metric to display the chart
              </div>
            ) : selectedAsins.length > 1 ? (
              // Multi-ASIN comparison mode - show each ASIN as a separate line
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={perAsinChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  {hasCurrencyMetric && (
                    <YAxis
                      yAxisId="currency"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `$${value >= 1000 ? (value/1000).toFixed(0)+'k' : value}`}
                    />
                  )}
                  {hasUnitMetric && (
                    <YAxis
                      yAxisId="units"
                      orientation={hasCurrencyMetric ? "right" : "left"}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => value >= 1000 ? (value/1000).toFixed(0)+'k' : String(value)}
                    />
                  )}
                  {hasPercentMetric && !hasCurrencyMetric && !hasUnitMetric && (
                    <YAxis
                      yAxisId="percent"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                  )}
                  <Tooltip
                    formatter={(value, name) => {
                      const nameStr = String(name)
                      if (nameStr.includes('COGS') || nameStr.includes('Revenue')) {
                        return [`$${Number(value).toLocaleString()}`, name]
                      }
                      if (nameStr.includes('Conv')) {
                        return [`${(Number(value) * 100).toFixed(2)}%`, name]
                      }
                      return [Number(value).toLocaleString(), name]
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  {selectedAsins.map((asin, idx) => (
                    <>
                      {selectedMetrics.shippedCogs && (
                        <Line
                          key={`${asin}_cogs`}
                          yAxisId="currency"
                          type="monotone"
                          dataKey={`${asin}_cogs`}
                          name={`${asin} COGS`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {selectedMetrics.orderedRevenue && (
                        <Line
                          key={`${asin}_revenue`}
                          yAxisId="currency"
                          type="monotone"
                          dataKey={`${asin}_revenue`}
                          name={`${asin} Revenue`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={false}
                          connectNulls
                        />
                      )}
                      {selectedMetrics.shippedUnits && (
                        <Line
                          key={`${asin}_shippedUnits`}
                          yAxisId="units"
                          type="monotone"
                          dataKey={`${asin}_shippedUnits`}
                          name={`${asin} Shipped`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      )}
                      {selectedMetrics.orderedUnits && (
                        <Line
                          key={`${asin}_orderedUnits`}
                          yAxisId="units"
                          type="monotone"
                          dataKey={`${asin}_orderedUnits`}
                          name={`${asin} Ordered`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={2}
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls
                        />
                      )}
                      {selectedMetrics.glanceViews && (
                        <Line
                          key={`${asin}_views`}
                          yAxisId="units"
                          type="monotone"
                          dataKey={`${asin}_views`}
                          name={`${asin} Traffic`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={2}
                          strokeDasharray="1 2"
                          dot={false}
                          connectNulls
                        />
                      )}
                      {selectedMetrics.conversionRate && (
                        <Line
                          key={`${asin}_conversion`}
                          yAxisId={hasPercentMetric && !hasCurrencyMetric && !hasUnitMetric ? "percent" : "currency"}
                          type="monotone"
                          dataKey={`${asin}_conversion`}
                          name={`${asin} Conv%`}
                          stroke={ASIN_COLORS[idx % ASIN_COLORS.length]}
                          strokeWidth={1}
                          strokeDasharray="8 4"
                          dot={false}
                          connectNulls
                        />
                      )}
                    </>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              // Single ASIN or aggregated mode - show metrics as separate lines
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={aggregatedChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  {hasCurrencyMetric && (
                    <YAxis
                      yAxisId="currency"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `$${value >= 1000 ? (value/1000).toFixed(0)+'k' : value}`}
                    />
                  )}
                  {hasUnitMetric && (
                    <YAxis
                      yAxisId="units"
                      orientation={hasCurrencyMetric ? "right" : "left"}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => value >= 1000 ? (value/1000).toFixed(0)+'k' : String(value)}
                    />
                  )}
                  {hasPercentMetric && !hasCurrencyMetric && !hasUnitMetric && (
                    <YAxis
                      yAxisId="percent"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                    />
                  )}
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'COGS' || name === 'Revenue') {
                        return [`$${Number(value).toLocaleString()}`, name]
                      }
                      if (name === 'Conversion') {
                        return [`${(Number(value) * 100).toFixed(2)}%`, name]
                      }
                      return [Number(value).toLocaleString(), name]
                    }}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  {selectedMetrics.shippedCogs && (
                    <Line
                      yAxisId="currency"
                      type="monotone"
                      dataKey="shippedCogs"
                      name="COGS"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {selectedMetrics.orderedRevenue && (
                    <Line
                      yAxisId="currency"
                      type="monotone"
                      dataKey="orderedRevenue"
                      name="Revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {selectedMetrics.shippedUnits && (
                    <Line
                      yAxisId="units"
                      type="monotone"
                      dataKey="shippedUnits"
                      name="Shipped Units"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {selectedMetrics.orderedUnits && (
                    <Line
                      yAxisId="units"
                      type="monotone"
                      dataKey="orderedUnits"
                      name="Ordered Units"
                      stroke="#ec4899"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {selectedMetrics.glanceViews && (
                    <Line
                      yAxisId="units"
                      type="monotone"
                      dataKey="glanceViews"
                      name="Traffic"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {selectedMetrics.conversionRate && (
                    <Line
                      yAxisId={hasPercentMetric && !hasCurrencyMetric && !hasUnitMetric ? "percent" : "currency"}
                      type="monotone"
                      dataKey="conversionRate"
                      name="Conversion"
                      stroke="#0891b2"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Individual Charts Mode */}
      {chartMode === 'individual' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Shipped COGS Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Shipped COGS</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={individualChartData}>
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
                <BarChart data={individualChartData}>
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
                <LineChart data={individualChartData}>
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
                <LineChart data={individualChartData}>
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
      )}
    </div>
  )
}
