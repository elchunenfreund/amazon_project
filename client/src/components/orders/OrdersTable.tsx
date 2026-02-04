import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { Eye, ExternalLink, Loader2 } from 'lucide-react'
import { DataTable } from '@/components/shared'
import { POStateBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { usePurchaseOrderLineItems } from '@/hooks'
import type { PurchaseOrder } from '@/lib/api'
import { getAmazonProductUrl } from '@/lib/api'

// Separate component for the popover content to handle data fetching
function LineItemsPopover({ poNumber }: { poNumber: string }) {
  const [open, setOpen] = useState(false)
  const { data: lineItems, isLoading } = usePurchaseOrderLineItems(open ? poNumber : '')

  // Calculate summary
  const summary = useMemo(() => {
    if (!lineItems) return { totalUnits: 0, totalCost: 0 }
    return {
      totalUnits: lineItems.reduce((sum, item) => sum + (item.ordered_quantity || 0), 0),
      totalCost: lineItems.reduce((sum, item) => {
        const qty = item.ordered_quantity || 0
        const cost = item.ordered_unit_cost || 0
        return sum + (qty * cost)
      }, 0),
    }
  }, [lineItems])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto p-1 font-medium hover:underline">
          {lineItems?.length ?? '...'} items
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <h4 className="font-semibold">Line Items Summary</h4>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : lineItems && lineItems.length > 0 ? (
            <>
              <div className="flex justify-between text-sm text-muted">
                <span>Total Units: <strong className="text-primary">{summary.totalUnits.toLocaleString()}</strong></span>
                <span>Total: <strong className="text-primary">${summary.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto border-t pt-2">
                {lineItems.map((item) => (
                  <div key={item.asin} className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-b-0">
                    <div className="flex items-center gap-1">
                      <a
                        href={getAmazonProductUrl(item.asin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {item.asin}
                      </a>
                      <a
                        href={getAmazonProductUrl(item.asin)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted hover:text-accent"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <span className="text-muted">x{item.ordered_quantity?.toLocaleString() ?? 0}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-2 text-center text-sm text-muted">No line items</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface OrdersTableProps {
  data: PurchaseOrder[]
  isLoading?: boolean
  onViewDetails?: (poNumber: string) => void
}

export function OrdersTable({
  data,
  isLoading = false,
  onViewDetails,
}: OrdersTableProps) {
  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      {
        accessorKey: 'po_number',
        header: 'PO Number',
        cell: ({ row }) => (
          <span className="font-mono font-medium">{row.original.po_number}</span>
        ),
      },
      {
        accessorKey: 'po_state',
        header: 'Status',
        cell: ({ row }) => (
          <POStateBadge state={row.original.po_state} />
        ),
      },
      {
        accessorKey: 'order_date',
        header: 'Order Date',
        cell: ({ row }) => {
          const date = row.original.order_date
          return date ? format(new Date(date), 'MMM d, yyyy') : '-'
        },
      },
      {
        accessorKey: 'ship_window_start',
        header: 'Ship Window',
        cell: ({ row }) => {
          const start = row.original.ship_window_start
          const end = row.original.ship_window_end
          if (!start) return '-'
          return (
            <span className="text-sm">
              {format(new Date(start), 'MMM d')}
              {end && ` - ${format(new Date(end), 'MMM d')}`}
            </span>
          )
        },
      },
      {
        accessorKey: 'delivery_window_start',
        header: 'Delivery Window',
        cell: ({ row }) => {
          const start = row.original.delivery_window_start
          const end = row.original.delivery_window_end
          if (!start) return '-'
          return (
            <span className="text-sm">
              {format(new Date(start), 'MMM d')}
              {end && ` - ${format(new Date(end), 'MMM d')}`}
            </span>
          )
        },
      },
      {
        accessorKey: 'total_items',
        header: 'Items',
        cell: ({ row }) => {
          return <LineItemsPopover poNumber={row.original.po_number} />
        },
      },
      {
        accessorKey: 'total_cost',
        header: 'Total Cost',
        cell: ({ row }) => {
          const value = row.original.total_cost
          return value ? `$${value.toLocaleString()}` : '-'
        },
      },
      {
        accessorKey: 'vendor_code',
        header: 'Vendor',
        cell: ({ row }) => {
          const code = row.original.vendor_code
          return code ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">
              {code}
            </span>
          ) : '-'
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDetails?.(row.original.po_number)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Details
          </Button>
        ),
      },
    ],
    [onViewDetails]
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      searchPlaceholder="Search PO numbers..."
      searchColumn="po_number"
      enableColumnVisibility
      pageSize={15}
    />
  )
}
