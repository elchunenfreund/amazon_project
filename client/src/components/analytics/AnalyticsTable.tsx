import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { DataTable } from '@/components/shared'
import type { VendorReport } from '@/lib/api'

interface AnalyticsTableProps {
  data: VendorReport[]
  isLoading?: boolean
}

export function AnalyticsTable({ data, isLoading = false }: AnalyticsTableProps) {
  const columns = useMemo<ColumnDef<VendorReport>[]>(
    () => [
      {
        accessorKey: 'report_date',
        header: 'Date',
        cell: ({ row }) => {
          const date = row.original.report_date
          return format(new Date(date), 'MMM d, yyyy')
        },
      },
      {
        accessorKey: 'asin',
        header: 'ASIN',
        cell: ({ row }) => (
          <span className="font-mono">{row.original.asin}</span>
        ),
      },
      {
        accessorKey: 'shipped_cogs',
        header: 'Shipped COGS',
        cell: ({ row }) => {
          const value = row.original.shipped_cogs
          return value ? `$${value.toLocaleString()}` : '-'
        },
      },
      {
        accessorKey: 'shipped_units',
        header: 'Shipped Units',
        cell: ({ row }) => {
          const value = row.original.shipped_units
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'ordered_units',
        header: 'Ordered Units',
        cell: ({ row }) => {
          const value = row.original.ordered_units
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'ordered_revenue',
        header: 'Ordered Revenue',
        cell: ({ row }) => {
          const value = row.original.ordered_revenue
          return value ? `$${value.toLocaleString()}` : '-'
        },
      },
      {
        accessorKey: 'sellable_on_hand_inventory',
        header: 'Inventory',
        cell: ({ row }) => {
          const value = row.original.sellable_on_hand_inventory
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'glance_views',
        header: 'Glance Views',
        cell: ({ row }) => {
          const value = row.original.glance_views
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'conversion_rate',
        header: 'Conv. Rate',
        cell: ({ row }) => {
          const value = row.original.conversion_rate
          return value ? `${(value * 100).toFixed(2)}%` : '-'
        },
      },
      {
        accessorKey: 'sell_through_rate',
        header: 'Sell-Through',
        cell: ({ row }) => {
          const value = row.original.sell_through_rate
          return value ? `${(value * 100).toFixed(1)}%` : '-'
        },
      },
      {
        accessorKey: 'vendor_confirmation_rate',
        header: 'PO Confirm Rate',
        cell: ({ row }) => {
          const value = row.original.vendor_confirmation_rate
          return value ? `${(value * 100).toFixed(1)}%` : '-'
        },
      },
      {
        accessorKey: 'open_purchase_order_units',
        header: 'Open PO Units',
        cell: ({ row }) => {
          const value = row.original.open_purchase_order_units
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'receive_fill_rate',
        header: 'Fill Rate',
        cell: ({ row }) => {
          const value = row.original.receive_fill_rate
          return value ? `${(value * 100).toFixed(1)}%` : '-'
        },
      },
      {
        accessorKey: 'average_vendor_lead_time_days',
        header: 'Lead Time (days)',
        cell: ({ row }) => {
          const value = row.original.average_vendor_lead_time_days
          return value ? value.toFixed(1) : '-'
        },
      },
      {
        accessorKey: 'net_received_inventory_units',
        header: 'Net Received',
        cell: ({ row }) => {
          const value = row.original.net_received_inventory_units
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'unsellable_on_hand_inventory',
        header: 'Unsellable',
        cell: ({ row }) => {
          const value = row.original.unsellable_on_hand_inventory
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'aged_90_plus_inventory_units',
        header: 'Aged 90+ Units',
        cell: ({ row }) => {
          const value = row.original.aged_90_plus_inventory_units
          return value?.toLocaleString() ?? '-'
        },
      },
      {
        accessorKey: 'customer_returns',
        header: 'Returns',
        cell: ({ row }) => {
          const value = row.original.customer_returns
          return value?.toLocaleString() ?? '-'
        },
      },
    ],
    []
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      searchPlaceholder="Search by ASIN..."
      searchColumn="asin"
      enableColumnVisibility
      pageSize={15}
    />
  )
}
