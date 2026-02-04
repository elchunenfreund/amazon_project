import { useState, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Modal } from './Modal'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useAsinHistory } from '@/hooks'
import type { DailyReport } from '@/lib/api'

interface HistoryModalProps {
  asin: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * When true, shows a simplified view with basic columns only (Date, Status, Seller, Price, Rank).
   * When false, shows full view with chart toggle and vendor metrics.
   * @default false
   */
  simplified?: boolean
}

interface MetricSelection {
  price: boolean
  ranking: boolean
  availability: boolean
  shippedUnits: boolean
  orderedUnits: boolean
  revenue: boolean
  glanceViews: boolean
}

const METRIC_COLORS = {
  price: '#3b82f6',      // blue-500
  ranking: '#22c55e',    // green-500
  availability: '#f59e0b', // amber-500
  shippedUnits: '#a855f7', // purple-500
  orderedUnits: '#ec4899', // pink-500
  revenue: '#10b981',    // emerald-500
  glanceViews: '#f97316', // orange-500
} as const

const METRIC_LABELS = {
  price: 'Price',
  ranking: 'Rank',
  availability: 'Status',
  shippedUnits: 'Shipped',
  orderedUnits: 'Ordered',
  revenue: 'Revenue',
  glanceViews: 'Traffic',
} as const

export function HistoryModal({
  asin,
  open,
  onOpenChange,
  simplified = false,
}: HistoryModalProps) {
  const { data: history, isLoading } = useAsinHistory(asin)
  const [showChart, setShowChart] = useState(false)
  const [selectedMetrics, setSelectedMetrics] = useState<MetricSelection>({
    price: true,
    ranking: false,
    availability: false,
    shippedUnits: false,
    orderedUnits: false,
    revenue: false,
    glanceViews: false,
  })

  // Prepare chart data (oldest first for proper chart rendering)
  const chartData = useMemo(() => {
    if (!history?.length) return []
    return history
      .slice()
      .reverse()
      .map((report: DailyReport) => ({
        date: report.check_date,
        price: report.price ?? null,
        ranking: report.ranking ?? null,
        availability: report.available ? 1 : 0,
        shippedUnits: report.shipped_units ?? null,
        orderedUnits: report.ordered_units ?? null,
        revenue: report.ordered_revenue ?? null,
        glanceViews: report.glance_views ?? null,
      }))
  }, [history])

  const toggleMetric = (metric: keyof MetricSelection) => {
    setSelectedMetrics(prev => ({ ...prev, [metric]: !prev[metric] }))
  }

  const hasAnyMetricSelected = Object.values(selectedMetrics).some(v => v)

  // Determine which Y-axis configurations are needed
  const hasCurrencyMetric = selectedMetrics.price || selectedMetrics.revenue
  const hasUnitMetric = selectedMetrics.shippedUnits || selectedMetrics.orderedUnits || selectedMetrics.glanceViews
  const hasRankMetric = selectedMetrics.ranking

  const renderMetricCheckbox = (metric: keyof MetricSelection) => (
    <div className="flex items-center gap-2" key={metric}>
      <Checkbox
        id={`metric-${metric}`}
        checked={selectedMetrics[metric]}
        onCheckedChange={() => toggleMetric(metric)}
      />
      <Label htmlFor={`metric-${metric}`} className="cursor-pointer text-xs flex items-center gap-1">
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: METRIC_COLORS[metric] }}
        />
        {METRIC_LABELS[metric]}
      </Label>
    </div>
  )

  const renderChart = () => {
    if (!showChart || simplified) return null

    if (!hasAnyMetricSelected) {
      return (
        <div className="h-32 flex items-center justify-center text-muted text-sm">
          Select at least one metric to display the chart
        </div>
      )
    }

    return (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => {
                const date = new Date(value)
                return `${date.getMonth() + 1}/${date.getDate()}`
              }}
            />
            {/* Left Y-Axis for currency values */}
            {hasCurrencyMetric && (
              <YAxis
                yAxisId="currency"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => `$${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
              />
            )}
            {/* Right Y-Axis for units/count values */}
            {hasUnitMetric && (
              <YAxis
                yAxisId="units"
                orientation={hasCurrencyMetric ? 'right' : 'left'}
                tick={{ fontSize: 11 }}
                tickFormatter={(value) => value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}
              />
            )}
            {/* Separate Y-Axis for ranking (reversed scale) */}
            {hasRankMetric && !hasCurrencyMetric && !hasUnitMetric && (
              <YAxis
                yAxisId="ranking"
                orientation="left"
                tick={{ fontSize: 11 }}
                reversed
              />
            )}
            {hasRankMetric && (hasCurrencyMetric || hasUnitMetric) && (
              <YAxis
                yAxisId="ranking"
                orientation="right"
                tick={{ fontSize: 11 }}
                reversed
                hide={hasUnitMetric && hasCurrencyMetric}
              />
            )}
            <Tooltip
              formatter={(value, name) => {
                if (name === 'Price') return [`$${Number(value).toFixed(2)}`, 'Price']
                if (name === 'Rank') return [`#${Number(value).toLocaleString()}`, 'Rank']
                if (name === 'Status') return [value === 1 ? 'Available' : 'Unavailable', 'Status']
                if (name === 'Revenue') return [`$${Number(value).toLocaleString()}`, 'Revenue']
                if (name === 'Shipped' || name === 'Ordered' || name === 'Traffic') {
                  return [Number(value).toLocaleString(), name]
                }
                return [value, name]
              }}
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
            />
            <Legend />
            {selectedMetrics.price && (
              <Line
                yAxisId="currency"
                type="monotone"
                dataKey="price"
                name="Price"
                stroke={METRIC_COLORS.price}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {selectedMetrics.revenue && (
              <Line
                yAxisId="currency"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke={METRIC_COLORS.revenue}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {selectedMetrics.ranking && (
              <Line
                yAxisId="ranking"
                type="monotone"
                dataKey="ranking"
                name="Rank"
                stroke={METRIC_COLORS.ranking}
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
                name="Shipped"
                stroke={METRIC_COLORS.shippedUnits}
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
                name="Ordered"
                stroke={METRIC_COLORS.orderedUnits}
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
                stroke={METRIC_COLORS.glanceViews}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            )}
            {selectedMetrics.availability && (
              <Line
                yAxisId={hasCurrencyMetric ? 'currency' : hasUnitMetric ? 'units' : hasRankMetric ? 'ranking' : 'currency'}
                type="stepAfter"
                dataKey="availability"
                name="Status"
                stroke={METRIC_COLORS.availability}
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderSimplifiedTable = () => (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white border-b">
          <tr>
            <th className="text-left py-2 px-2">Date</th>
            <th className="text-left py-2 px-2">Status</th>
            <th className="text-left py-2 px-2">Seller</th>
            <th className="text-right py-2 px-2">Price</th>
            <th className="text-right py-2 px-2">Rank</th>
          </tr>
        </thead>
        <tbody>
          {history?.map((report: DailyReport, idx: number) => (
            <tr key={idx} className="border-b hover:bg-slate-50">
              <td className="py-2 px-2">{report.check_date}</td>
              <td className="py-2 px-2">
                <span className={report.available ? 'text-green-600' : 'text-red-600'}>
                  {report.available ? 'Available' : 'Unavailable'}
                </span>
              </td>
              <td className="py-2 px-2">{report.seller || '-'}</td>
              <td className="py-2 px-2 text-right">
                {report.price ? `$${report.price.toFixed(2)}` : '-'}
              </td>
              <td className="py-2 px-2 text-right">
                {report.ranking ? `#${report.ranking.toLocaleString()}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderFullTable = () => (
    <div className="max-h-64 overflow-x-auto overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white border-b">
          <tr>
            <th className="text-left py-2 px-2 whitespace-nowrap">Date</th>
            <th className="text-left py-2 px-2 whitespace-nowrap">Status</th>
            <th className="text-left py-2 px-2 whitespace-nowrap">Seller</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Price</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Rank</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Shipped</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Ordered</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Revenue</th>
            <th className="text-right py-2 px-2 whitespace-nowrap">Traffic</th>
          </tr>
        </thead>
        <tbody>
          {history?.map((report: DailyReport, idx: number) => (
            <tr key={idx} className="border-b hover:bg-slate-50">
              <td className="py-2 px-2 whitespace-nowrap">{report.check_date}</td>
              <td className="py-2 px-2 whitespace-nowrap">
                <span className={report.available ? 'text-green-600' : 'text-red-600'}>
                  {report.available ? 'Available' : 'Unavailable'}
                </span>
              </td>
              <td className="py-2 px-2">{report.seller || '-'}</td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.price ? `$${report.price.toFixed(2)}` : '-'}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.ranking ? `#${report.ranking.toLocaleString()}` : '-'}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.shipped_units != null ? report.shipped_units.toLocaleString() : '-'}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.ordered_units != null ? report.ordered_units.toLocaleString() : '-'}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.ordered_revenue != null ? `$${report.ordered_revenue.toLocaleString()}` : '-'}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap">
                {report.glance_views != null ? report.glance_views.toLocaleString() : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`History for ${asin}`}
      description={simplified ? 'Price and availability history' : 'Price, availability, and sales history'}
      size={simplified ? 'lg' : 'full'}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !history?.length ? (
        <p className="text-muted text-center py-8">No history available</p>
      ) : simplified ? (
        renderSimplifiedTable()
      ) : (
        <div className="space-y-4">
          {/* Chart Toggle and Metric Selection */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-chart"
                checked={showChart}
                onCheckedChange={(checked) => setShowChart(!!checked)}
              />
              <Label htmlFor="show-chart" className="font-medium cursor-pointer">
                Show Chart
              </Label>
            </div>
            {showChart && (
              <>
                <div className="h-4 w-px bg-slate-300" />
                <span className="text-sm text-muted">Metrics:</span>
                {renderMetricCheckbox('price')}
                {renderMetricCheckbox('ranking')}
                {renderMetricCheckbox('availability')}
                {renderMetricCheckbox('shippedUnits')}
                {renderMetricCheckbox('orderedUnits')}
                {renderMetricCheckbox('revenue')}
                {renderMetricCheckbox('glanceViews')}
              </>
            )}
          </div>

          {/* Chart */}
          {renderChart()}

          {/* Data Table */}
          {renderFullTable()}
        </div>
      )}
    </Modal>
  )
}
