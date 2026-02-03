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
