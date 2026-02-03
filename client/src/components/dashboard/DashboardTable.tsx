import { useState, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2, Moon, TrendingUp, TrendingDown } from 'lucide-react'
import { DataTable, Modal } from '@/components/shared'
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

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`History for ${asin}`}
      description="Price and availability history"
      size="lg"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : !history?.length ? (
        <p className="text-muted text-center py-8">No history available</p>
      ) : (
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
              {history.map((report: DailyReport, idx: number) => (
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
            <span className="line-clamp-2 max-w-xs" title={title ?? ''}>
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
