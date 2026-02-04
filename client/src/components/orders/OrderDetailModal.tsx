import { format } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { Modal } from '@/components/shared'
import { POStateBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePurchaseOrder } from '@/hooks'
import { getAmazonProductUrl } from '@/lib/api'

interface OrderDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  poNumber: string | null
}

export function OrderDetailModal({
  open,
  onOpenChange,
  poNumber,
}: OrderDetailModalProps) {
  const { data: order, isLoading } = usePurchaseOrder(poNumber ?? '')

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`PO: ${poNumber}`}
      description="Purchase order details and line items"
      size="4xl"
    >
      <div className="max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : order ? (
          <div className="space-y-6">
          {/* Order Details */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted">Status</p>
              <POStateBadge state={order.po_state} className="mt-1" />
            </div>
            <div>
              <p className="text-sm text-muted">Order Date</p>
              <p className="font-medium">
                {order.order_date
                  ? format(new Date(order.order_date), 'MMM d, yyyy')
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Total Items</p>
              <p className="font-medium">{order.total_items?.toLocaleString() ?? '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Total Cost</p>
              <p className="font-medium">
                {order.total_cost ? `$${order.total_cost.toLocaleString()}` : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Ship Window</p>
              <p className="font-medium">
                {order.ship_window_start
                  ? `${format(new Date(order.ship_window_start), 'MMM d')} - ${
                      order.ship_window_end
                        ? format(new Date(order.ship_window_end), 'MMM d')
                        : ''
                    }`
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Delivery Window</p>
              <p className="font-medium">
                {order.delivery_window_start
                  ? `${format(new Date(order.delivery_window_start), 'MMM d')} - ${
                      order.delivery_window_end
                        ? format(new Date(order.delivery_window_end), 'MMM d')
                        : ''
                    }`
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Vendor Code</p>
              <p className="font-medium">{order.vendor_code ?? '-'}</p>
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div>
            <h3 className="mb-4 text-lg font-semibold">Line Items</h3>
            {order.line_items && order.line_items.length > 0 ? (
              <div className="rounded-md border border-border overflow-auto max-h-[40vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ASIN</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="text-right">Qty Ordered</TableHead>
                      <TableHead className="text-right">Qty Received</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.line_items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
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
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted">
                          {item.sku ?? '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {item.title ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.ordered_quantity?.toLocaleString() ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.received_quantity?.toLocaleString() ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.ordered_unit_cost
                            ? `$${item.ordered_unit_cost.toFixed(2)}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {item.acknowledged_status ?? '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center text-muted">No line items found</p>
            )}
          </div>
        </div>
        ) : (
          <p className="text-center text-muted">Order not found</p>
        )}
      </div>
    </Modal>
  )
}
