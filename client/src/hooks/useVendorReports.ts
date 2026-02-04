import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vendorReportsApi, type VendorReportFilters } from '@/lib/api'

export function useVendorReports(filters?: VendorReportFilters) {
  return useQuery({
    queryKey: ['vendor-reports', filters],
    queryFn: () => vendorReportsApi.getAll(filters),
  })
}

export function useVendorReportAsins() {
  return useQuery({
    queryKey: ['vendor-reports', 'asins'],
    queryFn: vendorReportsApi.getAsins,
  })
}

export function useSyncVendorReports() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: vendorReportsApi.sync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-reports'] })
    },
  })
}

export function useVendorReportsByAsin(asin: string) {
  return useQuery({
    queryKey: ['vendor-reports', 'asin', asin],
    queryFn: () => vendorReportsApi.getAll({ asin }),
    enabled: !!asin,
  })
}
