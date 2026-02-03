import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { DataTable } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Product } from '@/lib/api'

interface ProductsTableProps {
  data: Product[]
  isLoading?: boolean
  onEdit?: (product: Product) => void
  onDelete?: (asin: string) => void
  onSelectionChange?: (products: Product[]) => void
}

export function ProductsTable({
  data,
  isLoading = false,
  onEdit,
  onDelete,
  onSelectionChange,
}: ProductsTableProps) {
  const columns = useMemo<ColumnDef<Product>[]>(
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
        accessorKey: 'header',
        header: 'Title',
        cell: ({ row }) => {
          const title = row.original.header
          return (
            <span className="line-clamp-2 max-w-xs text-sm" title={title ?? ''}>
              {title || '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'comment',
        header: 'Comment',
        cell: ({ row }) => {
          const comment = row.original.comment
          return (
            <span className="line-clamp-1 max-w-md text-sm" title={comment ?? ''}>
              {comment || '-'}
            </span>
          )
        },
      },
      {
        accessorKey: 'snoozed',
        header: 'Snoozed',
        cell: ({ row }) => {
          const snoozed = row.original.snoozed
          const snoozeUntil = row.original.snooze_until
          if (!snoozed) return <span className="text-muted">No</span>
          try {
            return (
              <span className="text-warning">
                Yes{snoozeUntil ? ` (until ${format(new Date(snoozeUntil), 'MMM d')})` : ''}
              </span>
            )
          } catch {
            return <span className="text-warning">Yes</span>
          }
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ row }) => {
          const date = row.original.created_at
          if (!date) return <span className="text-muted">-</span>
          try {
            return (
              <span className="text-sm text-muted">
                {format(new Date(date), 'MMM d, yyyy')}
              </span>
            )
          } catch {
            return <span className="text-muted">-</span>
          }
        },
      },
      {
        accessorKey: 'updated_at',
        header: 'Updated',
        cell: ({ row }) => {
          const date = row.original.updated_at
          if (!date) return <span className="text-muted">-</span>
          try {
            return (
              <span className="text-sm text-muted">
                {format(new Date(date), 'MMM d, yyyy')}
              </span>
            )
          } catch {
            return <span className="text-muted">-</span>
          }
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const product = row.original
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
                  <Link to={`/history/${product.asin}`}>
                    <History className="mr-2 h-4 w-4" />
                    View History
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit?.(product)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger focus:text-danger"
                  onClick={() => onDelete?.(product.asin)}
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
    [onEdit, onDelete]
  )

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      searchPlaceholder="Search ASINs..."
      searchColumn="asin"
      enableRowSelection
      enableColumnVisibility
      pageSize={20}
      onRowSelectionChange={onSelectionChange}
    />
  )
}
