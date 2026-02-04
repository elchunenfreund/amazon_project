import { useState, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MoreHorizontal, History, Edit, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { DataTable, Modal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getAmazonProductUrl } from '@/lib/api'
import type { Product, DailyReport } from '@/lib/api'
import { useAsinHistory } from '@/hooks'

interface ProductsTableProps {
  data: Product[]
  isLoading?: boolean
  onEdit?: (product: Product) => void
  onDelete?: (asin: string) => void
  onSelectionChange?: (products: Product[]) => void
}

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

export function ProductsTable({
  data,
  isLoading = false,
  onEdit,
  onDelete,
  onSelectionChange,
}: ProductsTableProps) {
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedAsin, setSelectedAsin] = useState<string>('')

  const handleViewHistory = (asin: string) => {
    setSelectedAsin(asin)
    setHistoryModalOpen(true)
  }

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
                href={getAmazonProductUrl(asin)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-accent"
                aria-label={`Open ${asin} on Amazon (opens in new tab)`}
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
        accessorKey: 'last_po_date',
        header: 'Last PO',
        cell: ({ row }) => {
          const date = row.original.last_po_date
          if (!date) return <span className="text-muted">-</span>
          return <span className="text-sm">{date}</span>
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
    <>
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
      <HistoryModal
        asin={selectedAsin}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </>
  )
}
