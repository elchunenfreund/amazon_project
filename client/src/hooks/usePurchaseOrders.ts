import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { purchaseOrdersApi, type POFilters } from '@/lib/api'

export function usePurchaseOrders(filters?: POFilters) {
  return useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: () => purchaseOrdersApi.getAll(filters),
  })
}

export function usePurchaseOrder(poNumber: string) {
  return useQuery({
    queryKey: ['purchase-orders', poNumber],
    queryFn: () => purchaseOrdersApi.get(poNumber),
    enabled: !!poNumber,
  })
}

export function usePurchaseOrderLineItems(poNumber: string) {
  return useQuery({
    queryKey: ['purchase-orders', poNumber, 'items'],
    queryFn: () => purchaseOrdersApi.getLineItems(poNumber),
    enabled: !!poNumber,
  })
}

export function usePurchaseOrderCalendar(year: number, month: number) {
  return useQuery({
    queryKey: ['purchase-orders', 'calendar', year, month],
    queryFn: () => purchaseOrdersApi.getCalendar(year, month),
  })
}

export function useSyncPurchaseOrders() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: purchaseOrdersApi.sync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}
