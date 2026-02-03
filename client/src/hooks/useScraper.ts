import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scraperApi } from '@/lib/api'

export function useScraperStatus() {
  return useQuery({
    queryKey: ['scraper', 'status'],
    queryFn: scraperApi.status,
    refetchInterval: 5000, // Refresh every 5 seconds when scraper is running
  })
}

export function useStartScraper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: scraperApi.start,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraper', 'status'] })
    },
  })
}

export function useStopScraper() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: scraperApi.stop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scraper', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['asins'] })
    },
  })
}
