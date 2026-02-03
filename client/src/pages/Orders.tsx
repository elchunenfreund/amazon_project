import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ShoppingCart, Clock, CheckCircle, XCircle, RefreshCw, Download } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { StatCard, StatCardGrid, DateRangePicker } from '@/components/shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  usePurchaseOrders,
  usePurchaseOrderCalendar,
  useSyncPurchaseOrders,
} from '@/hooks'
import type { POFilters } from '@/lib/api'
import type { DateRange } from 'react-day-picker'
import { OrdersCalendar, OrdersTable, OrderDetailModal } from '@/components/orders'

const PO_STATES = ['NEW', 'ACKNOWLEDGED', 'SHIPPED', 'RECEIVING', 'CLOSED', 'CANCELLED']

export function Orders() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [stateFilter, setStateFilter] = useState<string>('')
  const [selectedPO, setSelectedPO] = useState<string | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)

  const currentDate = new Date()
  const { data: calendarData, isLoading: calendarLoading } = usePurchaseOrderCalendar(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1
  )

  const filters: POFilters = {
    startDate: dateRange?.from?.toISOString().split('T')[0],
    endDate: dateRange?.to?.toISOString().split('T')[0],
    state: stateFilter === 'all' ? undefined : stateFilter || undefined,
  }

  const { data: orders, isLoading } = usePurchaseOrders(filters)
  const syncOrders = useSyncPurchaseOrders()

  const stats = useMemo(() => {
    if (!orders) return { total: 0, pending: 0, completed: 0, cancelled: 0 }

    return {
      total: orders.length,
      pending: orders.filter((o) => ['NEW', 'ACKNOWLEDGED', 'SHIPPED', 'RECEIVING'].includes(o.po_state)).length,
      completed: orders.filter((o) => o.po_state === 'CLOSED').length,
      cancelled: orders.filter((o) => o.po_state === 'CANCELLED').length,
    }
  }, [orders])

  const handleViewDetails = (poNumber: string) => {
    setSelectedPO(poNumber)
    setDetailModalOpen(true)
  }

  const handleExportCSV = () => {
    if (!orders || orders.length === 0) return

    const headers = ['PO Number', 'Status', 'Order Date', 'Ship Window', 'Delivery Window', 'Items', 'Total Cost', 'Vendor']
    const rows = orders.map((o) => [
      o.po_number,
      o.po_state,
      o.order_date ? format(new Date(o.order_date), 'yyyy-MM-dd') : '',
      o.ship_window_start ? `${format(new Date(o.ship_window_start), 'yyyy-MM-dd')} - ${o.ship_window_end ? format(new Date(o.ship_window_end), 'yyyy-MM-dd') : ''}` : '',
      o.delivery_window_start ? `${format(new Date(o.delivery_window_start), 'yyyy-MM-dd')} - ${o.delivery_window_end ? format(new Date(o.delivery_window_end), 'yyyy-MM-dd') : ''}` : '',
      o.total_items?.toString() ?? '',
      o.total_cost?.toString() ?? '',
      o.vendor_code ?? '',
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `purchase-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Purchase Orders"
        description="Amazon vendor purchase orders and line items"
        actions={
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleExportCSV} disabled={!orders?.length}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => syncOrders.mutate()}
              disabled={syncOrders.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncOrders.isPending ? 'animate-spin' : ''}`} />
              Sync Orders
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <StatCardGrid columns={4}>
        <StatCard
          title="Total Orders"
          value={stats.total}
          icon={<ShoppingCart className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={<Clock className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={<CheckCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Cancelled"
          value={stats.cancelled}
          icon={<XCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
      </StatCardGrid>

      {/* Filters */}
      <div className="my-8 flex flex-wrap gap-4">
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
          placeholder="Filter by date"
        />
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {PO_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {state}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar and Table */}
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Table View</TabsTrigger>
          <TabsTrigger value="calendar">Calendar View</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-6">
          <OrdersTable
            data={orders ?? []}
            isLoading={isLoading}
            onViewDetails={handleViewDetails}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <OrdersCalendar
            orders={calendarData ?? {}}
            isLoading={calendarLoading}
            onDateClick={(date) => {
              const dateStr = format(date, 'yyyy-MM-dd')
              const dayOrders = calendarData?.[dateStr]
              if (dayOrders && dayOrders.length > 0) {
                handleViewDetails(dayOrders[0].po_number)
              }
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Order Detail Modal */}
      <OrderDetailModal
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        poNumber={selectedPO}
      />
    </PageWrapper>
  )
}
