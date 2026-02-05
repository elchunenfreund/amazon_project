import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catalogApi } from '@/lib/api'

export function useCatalogItem(asin: string) {
  return useQuery({
    queryKey: ['catalog', asin],
    queryFn: () => catalogApi.get(asin),
    enabled: !!asin,
  })
}

export function useRefreshCatalogItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: catalogApi.refresh,
    onSuccess: (data) => {
      queryClient.setQueryData(['catalog', data.asin], data)
    },
  })
}

export function useCatalogSyncStatus() {
  return useQuery({
    queryKey: ['catalog', 'sync-status'],
    queryFn: () => catalogApi.getSyncStatus(),
    staleTime: 30000, // Cache for 30 seconds
  })
}

export function useSyncVendorCatalog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (limit?: number) => catalogApi.syncVendorAsins(limit),
    onSuccess: () => {
      // Invalidate sync status and vendor reports to show updated titles
      queryClient.invalidateQueries({ queryKey: ['catalog', 'sync-status'] })
      queryClient.invalidateQueries({ queryKey: ['vendor-reports'] })
    },
  })
}
