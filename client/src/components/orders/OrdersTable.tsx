import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { Eye } from 'lucide-react'
import { DataTable } from '@/components/shared'
import { POStateBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import type { PurchaseOrder } from '@/lib/api'

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
          const value = row.original.total_items
          return value?.toLocaleString() ?? '-'
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
