import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2, Moon, TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react'
import { DataTable } from '@/components/shared'
import { AvailabilityBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { AsinReport, DailyReport } from '@/lib/api'
import { asinsApi } from '@/lib/api'
import { cn } from '@/lib/utils'

// History dropdown component
function HistoryDropdown({ asin }: { asin: string }) {
  const [history, setHistory] = useState<DailyReport[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = async () => {
    if (history) return // Already loaded
    setLoading(true)
    setError(null)
    try {
      const data = await asinsApi.getHistory(asin)
      setHistory(data.slice(0, 5)) // Get last 5 entries
    } catch (e) {
      setError('Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger onPointerEnter={loadHistory}>
        <History className="mr-2 h-4 w-4" />
        View History
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-80">
          {loading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          )}
          {error && (
            <div className="p-4 text-sm text-red-600">{error}</div>
          )}
          {history && history.length === 0 && (
            <div className="p-4 text-sm text-muted">No history available</div>
          )}
          {history && history.length > 0 && (
            <>
              <div className="p-2 space-y-2">
                {history.map((entry) => (
                  <div key={entry.id} className="text-xs border-b border-border pb-2 last:border-0">
                    <div className="flex justify-between text-muted mb-1">
                      <span>{entry.check_date}</span>
                      <span>{entry.check_time?.slice(0, 5)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <span>Price: {entry.price ? `$${entry.price}` : '-'}</span>
                      <span>Seller: {entry.seller?.slice(0, 15) || '-'}</span>
                      <span>Status: {entry.available ? 'In Stock' : 'Unavailable'}</span>
                      <span>Rank: {entry.ranking ? `#${entry.ranking}` : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={`/history/${asin}`} className="justify-center">
                  View Full History
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

// Change indicator component
function ChangeIndicator({ field, changed, previousValue, currentValue }: {
  field: string
  changed: boolean
  previousValue?: string | number | null
  currentValue?: string | number | null
}) {
  if (!changed) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold ml-1 cursor-help">
            !
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="text-xs">
            <span className="font-semibold">{field} changed</span>
            {previousValue != null && currentValue != null && (
              <div className="mt-1">
                <span className="line-through text-muted-foreground">{previousValue}</span>
                {' → '}
                <span className="font-medium">{currentValue}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  const columns = useMemo<ColumnDef<AsinReport>[]>(
    () => [
      {
        accessorKey: 'asin',
        header: 'ASIN',
        cell: ({ row }) => {
          const asin = row.original.asin
          const hasChanges = row.original.has_changes
          const changedFields = row.original.changed_fields || []
          const snoozed = row.original.snoozed
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="text-xs">
                          <div className="font-semibold mb-1">Changed fields:</div>
                          <ul className="list-disc list-inside">
                            {changedFields.map((field) => (
                              <li key={field} className="capitalize">{field}</li>
                            ))}
                          </ul>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <span className="font-mono font-medium">{asin}</span>
                <a
                  href={`https://www.amazon.com/dp/${asin}`}
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
        accessorKey: 'available',
        header: 'Status',
        cell: ({ row }) => {
          const available = row.original.available
          const changed = row.original.changed_fields?.includes('availability')
          return (
            <div className="flex items-center gap-1">
              <div className={cn(changed && 'ring-2 ring-red-500 ring-offset-1 rounded')}>
                <AvailabilityBadge available={available} />
              </div>
              <ChangeIndicator
                field="Availability"
                changed={!!changed}
                previousValue={available ? 'Unavailable' : 'In Stock'}
                currentValue={available ? 'In Stock' : 'Unavailable'}
              />
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
            <div className="flex items-center gap-1">
              <span className={cn(
                "text-sm",
                changed && 'ring-2 ring-red-500 ring-offset-1 rounded px-1 bg-red-50'
              )}>
                {seller || '-'}
              </span>
              <ChangeIndicator
                field="Seller"
                changed={!!changed}
              />
            </div>
          )
        },
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => {
          const price = row.original.price
          const previousPrice = row.original.previous_price
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
              <ChangeIndicator
                field="Price"
                changed={!!changed}
                previousValue={previousPrice ? `$${previousPrice.toFixed(2)}` : undefined}
                currentValue={`$${price.toFixed(2)}`}
              />
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
        id: 'actions',
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
                <HistoryDropdown asin={asin} />
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
    [onEdit, onDelete, onToggleSnooze, enableRowSelection]
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
  )
}
