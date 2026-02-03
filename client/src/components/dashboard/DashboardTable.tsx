import { useState, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2, Moon, TrendingUp, TrendingDown } from 'lucide-react'
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
import { DataTable, Modal } from '@/components/shared'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { AvailabilityBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AsinReport, DailyReport } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAsinHistory } from '@/hooks'

// History Modal Component
function HistoryModal({ asin, open, onOpenChange }: { asin: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: history, isLoading } = useAsinHistory(asin)
  const [showChart, setShowChart] = useState(false)
  const [selectedMetrics, setSelectedMetrics] = useState({
    price: true,
    ranking: false,
    availability: false,
    shippedUnits: false,
    orderedUnits: false,
    revenue: false,
    glanceViews: false,
  })

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!history?.length) return []
    return history
      .slice()
      .reverse() // Oldest first for chart
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

  const toggleMetric = (metric: keyof typeof selectedMetrics) => {
    setSelectedMetrics(prev => ({ ...prev, [metric]: !prev[metric] }))
  }

  const hasAnyMetricSelected = Object.values(selectedMetrics).some(v => v)

  // Determine which Y-axis to use based on selected metrics
  const hasCurrencyMetric = selectedMetrics.price || selectedMetrics.revenue
  const hasUnitMetric = selectedMetrics.shippedUnits || selectedMetrics.orderedUnits || selectedMetrics.glanceViews
  const hasRankMetric = selectedMetrics.ranking

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`History for ${asin}`}
      description="Price, availability, and sales history"
      size="full"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !history?.length ? (
        <p className="text-muted text-center py-8">No history available</p>
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
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="metric-price"
                    checked={selectedMetrics.price}
                    onCheckedChange={() => toggleMetric('price')}
                  />
                  <Label htmlFor="metric-price" className="cursor-pointer text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    Price
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="metric-ranking"
                    checked={selectedMetrics.ranking}
                    onCheckedChange={() => toggleMetric('ranking')}
                  />
                  <Label htmlFor="metric-ranking" className="cursor-pointer text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    Rank
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="metric-availability"
                    checked={selectedMetrics.availability}
                    onCheckedChange={() => toggleMetric('availability')}
                  />
                  <Label htmlFor="metric-availability" className="cursor-pointer text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    Status
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
                    Shipped
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
                    Ordered
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="metric-revenue"
                    checked={selectedMetrics.revenue}
                    onCheckedChange={() => toggleMetric('revenue')}
                  />
                  <Label htmlFor="metric-revenue" className="cursor-pointer text-xs flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Revenue
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
              </>
            )}
          </div>

          {/* Chart */}
          {showChart && hasAnyMetricSelected && (
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
                      tickFormatter={(value) => `$${value >= 1000 ? (value/1000).toFixed(0)+'k' : value}`}
                    />
                  )}
                  {/* Right Y-Axis for units/count values */}
                  {hasUnitMetric && (
                    <YAxis
                      yAxisId="units"
                      orientation={hasCurrencyMetric ? "right" : "left"}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => value >= 1000 ? (value/1000).toFixed(0)+'k' : value}
                    />
                  )}
                  {/* Separate Y-Axis for ranking (reversed) */}
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
                      stroke="#3b82f6"
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
                      stroke="#10b981"
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
                      stroke="#22c55e"
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
                      name="Ordered"
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
                  {selectedMetrics.availability && (
                    <Line
                      yAxisId={hasCurrencyMetric ? 'currency' : hasUnitMetric ? 'units' : hasRankMetric ? 'ranking' : 'currency'}
                      type="stepAfter"
                      dataKey="availability"
                      name="Status"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {showChart && !hasAnyMetricSelected && (
            <div className="h-32 flex items-center justify-center text-muted text-sm">
              Select at least one metric to display the chart
            </div>
          )}

          {/* Data Table */}
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
                {history.map((report: DailyReport, idx: number) => (
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
        </div>
      )}
    </Modal>
  )
}

interface DashboardTableProps {
  data: AsinReport[]
  isLoading?: boolean
  onEdit?: (asin: AsinReport) => void
  onDelete?: (asin: string) => void
  onToggleSnooze?: (asin: string) => void
  enableRowSelection?: boolean
  onRowSelectionChange?: (rows: AsinReport[]) => void
}

export function DashboardTable({
  data,
  isLoading = false,
  onEdit,
  onDelete,
  onToggleSnooze,
  enableRowSelection = false,
  onRowSelectionChange,
}: DashboardTableProps) {
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedAsin, setSelectedAsin] = useState<string>('')

  const handleViewHistory = (asin: string) => {
    setSelectedAsin(asin)
    setHistoryModalOpen(true)
  }

  const columns = useMemo<ColumnDef<AsinReport>[]>(
    () => [
      {
        accessorKey: 'asin',
        header: 'ASIN',
        cell: ({ row }) => {
          const asin = row.original.asin
          const snoozed = row.original.snoozed
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{asin}</span>
                <a
                  href={`https://www.amazon.ca/dp/${asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted hover:text-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              {snoozed && (
                <Badge variant="secondary" className="w-fit text-xs bg-slate-200 text-slate-600">
                  <Moon className="h-3 w-3 mr-1" />
                  Snoozed
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'sku',
        header: 'SKU',
        cell: ({ row }) => {
          const sku = row.original.sku
          return (
            <span className="font-mono text-sm text-muted" title={sku ?? ''}>
              {sku || '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const title = row.original.title
          return (
            <span className="line-clamp-1 max-w-[150px] text-xs" title={title ?? ''}>
              {title || '-'}
            </span>
          )
        },
      },
      {
        id: 'changes',
        header: 'Changes',
        cell: ({ row }) => {
          const changedFields = row.original.changed_fields || []
          if (changedFields.length === 0) {
            return <span className="text-muted text-sm">-</span>
          }
          return (
            <div className="flex flex-wrap gap-1">
              {changedFields.map((field) => (
                <Badge
                  key={field}
                  variant="destructive"
                  className="text-xs capitalize"
                >
                  {field}
                </Badge>
              ))}
            </div>
          )
        },
      },
      {
        accessorKey: 'available',
        header: 'Status',
        cell: ({ row }) => {
          const available = row.original.available
          const changed = row.original.changed_fields?.includes('availability')
          return (
            <div className={cn(changed && 'ring-2 ring-red-500 ring-offset-1 rounded')}>
              <AvailabilityBadge available={available} />
            </div>
          )
        },
      },
      {
        accessorKey: 'seller',
        header: 'Seller',
        cell: ({ row }) => {
          const seller = row.original.seller
          const changed = row.original.changed_fields?.includes('seller')
          return (
            <span className={cn(
              "text-sm",
              changed && 'ring-2 ring-red-500 ring-offset-1 rounded px-1 bg-red-50'
            )}>
              {seller || '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => {
          const price = row.original.price
          const priceChange = row.original.price_change
          const changed = row.original.changed_fields?.includes('price')

          if (!price) return <span className="text-muted">-</span>

          return (
            <div className={cn(
              "flex items-center gap-1",
              changed && 'ring-2 ring-red-500 ring-offset-1 rounded px-1 bg-red-50'
            )}>
              <span className="font-medium">${price.toFixed(2)}</span>
              {priceChange != null && priceChange !== 0 && (
                <span className={cn(
                  "flex items-center text-xs",
                  priceChange > 0 ? "text-red-600" : "text-green-600"
                )}>
                  {priceChange > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  ${Math.abs(priceChange).toFixed(2)}
                </span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'shipped_units',
        header: 'Sales',
        cell: ({ row }) => {
          const units = row.original.shipped_units
          const revenue = row.original.shipped_revenue
          if (units == null && revenue == null) return <span className="text-muted">-</span>
          return (
            <div className="text-sm">
              {units != null && <div>{units.toLocaleString()} units</div>}
              {revenue != null && <div className="text-muted">${revenue.toLocaleString()}</div>}
            </div>
          )
        },
      },
      {
        accessorKey: 'glance_views',
        header: 'Traffic',
        cell: ({ row }) => {
          const views = row.original.glance_views
          return views ? (
            <span className="text-sm">{views.toLocaleString()}</span>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      },
      {
        accessorKey: 'received_quantity',
        header: 'Received',
        cell: ({ row }) => {
          const received = row.original.received_quantity
          return received ? (
            <span className="text-sm">{received.toLocaleString()}</span>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      },
      {
        accessorKey: 'inbound_quantity',
        header: 'Inbound',
        cell: ({ row }) => {
          const inbound = row.original.inbound_quantity
          return inbound ? (
            <span className="text-sm text-blue-600">{inbound.toLocaleString()}</span>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      },
      {
        accessorKey: 'last_po_date',
        header: 'Last PO',
        cell: ({ row }) => {
          const date = row.original.last_po_date
          return date ? (
            <span className="text-sm text-muted">{date}</span>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      },
      {
        accessorKey: 'ranking',
        header: 'Rank',
        cell: ({ row }) => {
          const ranking = row.original.ranking
          return ranking ? (
            <span className="text-sm">#{ranking.toLocaleString()}</span>
          ) : (
            <span className="text-muted">-</span>
          )
        },
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ row }) => {
          const comment = row.original.comment
          return (
            <span className="line-clamp-1 max-w-xs text-sm text-muted" title={comment ?? ''}>
              {comment || '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'check_date',
        header: 'Last Checked',
        cell: ({ row }) => {
          const date = row.original.check_date
          const time = row.original.check_time
          if (!date) return <span className="text-muted">Never</span>
          return (
            <span className="text-sm text-muted">
              {date} {time?.slice(0, 5)}
            </span>
          )
        },
      },
      {
        id: 'history',
        header: 'History',
        cell: ({ row }) => {
          const asin = row.original.asin
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewHistory(asin)}
              className="h-8 px-2"
            >
              <History className="h-4 w-4 mr-1" />
              View
            </Button>
          )
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => {
          const asin = row.original.asin
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(row.original)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleSnooze?.(asin)}>
                  <Moon className="mr-2 h-4 w-4" />
                  {row.original.snoozed ? 'Unsnooze' : 'Snooze'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  onClick={() => onDelete?.(asin)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [onEdit, onDelete, onToggleSnooze]
  )

  // Sort data to put changed items at the top
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (a.has_changes && !b.has_changes) return -1
      if (!a.has_changes && b.has_changes) return 1
      return 0
    })
  }, [data])

  return (
    <>
      <DataTable
        columns={columns}
        data={sortedData}
        isLoading={isLoading}
        searchPlaceholder="Search ASINs..."
        searchColumn="asin"
        enableColumnVisibility
        pageSize={20}
        enableRowSelection={enableRowSelection}
        onRowSelectionChange={onRowSelectionChange}
        getRowClassName={(row) =>
          row.original.has_changes ? 'bg-amber-50 dark:bg-amber-950/20' : ''
        }
      />
      <HistoryModal
        asin={selectedAsin}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </>
  )
}
