import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2, Moon } from 'lucide-react'
import { DataTable } from '@/components/shared'
import { AvailabilityBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AsinReport } from '@/lib/api'

interface DashboardTableProps {
  data: AsinReport[]
  isLoading?: boolean
  onEdit?: (asin: AsinReport) => void
  onDelete?: (asin: string) => void
  onToggleSnooze?: (asin: string) => void
}

export function DashboardTable({
  data,
  isLoading = false,
  onEdit,
  onDelete,
  onToggleSnooze,
}: DashboardTableProps) {
  const columns = useMemo<ColumnDef<AsinReport>[]>(
    () => [
      {
        accessorKey: 'asin',
        header: 'ASIN',
        cell: ({ row }) => {
          const asin = row.original.asin
          return (
            <div className="flex items-center gap-2">
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
          )
        },
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const title = row.original.title
          return (
            <span className="line-clamp-2 max-w-md" title={title ?? ''}>
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
          const snoozed = row.original.snoozed
          if (snoozed) {
            return (
              <span className="inline-flex items-center gap-1 text-sm text-muted">
                <Moon className="h-4 w-4" />
                Snoozed
              </span>
            )
          }
          return <AvailabilityBadge available={available} />
        },
      },
      {
        accessorKey: 'seller',
        header: 'Seller',
        cell: ({ row }) => {
          const seller = row.original.seller
          return <span className="text-sm">{seller || '-'}</span>
        },
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => {
          const price = row.original.price
          return price ? (
            <span className="font-medium">${price.toFixed(2)}</span>
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
                <DropdownMenuItem asChild>
                  <Link to={`/history/${asin}`}>
                    <History className="mr-2 h-4 w-4" />
                    View History
                  </Link>
                </DropdownMenuItem>
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

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      searchPlaceholder="Search ASINs..."
      searchColumn="asin"
      enableColumnVisibility
      pageSize={15}
    />
  )
}
