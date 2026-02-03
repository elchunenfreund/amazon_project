import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { asinsApi } from '@/lib/api'

export function useLatestAsins() {
  return useQuery({
    queryKey: ['asins', 'latest'],
    queryFn: asinsApi.getLatest,
  })
}

export function useAsinHistory(asin: string) {
  return useQuery({
    queryKey: ['asins', asin, 'history'],
    queryFn: () => asinsApi.getHistory(asin),
    enabled: !!asin,
  })
}

export function useAddAsin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: asinsApi.add,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asins'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useBulkAddAsins() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: asinsApi.bulkAdd,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asins'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useUpdateAsinComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ asin, comment }: { asin: string; comment: string }) =>
      asinsApi.updateComment(asin, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asins'] })
    },
  })
}

export function useToggleAsinSnooze() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: asinsApi.toggleSnooze,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asins'] })
    },
  })
}

export function useDeleteAsin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: asinsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asins'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
