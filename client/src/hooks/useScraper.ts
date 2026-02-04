import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { scraperApi } from '@/lib/api'

export function useScraperStatus() {
  return useQuery({
    queryKey: ['scraper', 'status'],
    queryFn: scraperApi.status,
    // Only poll every 2 seconds when scraper is running, otherwise stop polling
    refetchInterval: (query) => query.state.data?.running ? 2000 : false,
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
