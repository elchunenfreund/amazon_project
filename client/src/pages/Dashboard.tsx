import { useState, useMemo } from 'react'
import { Package, CheckCircle, XCircle, Clock, Play, Square, RefreshCw, Plus, Upload, Wifi, WifiOff } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { StatCard, StatCardGrid, ConfirmModal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useLatestAsins, useDeleteAsin, useToggleAsinSnooze, useStartScraper, useStopScraper, useScraperStatus, useSocket } from '@/hooks'
import {
  DashboardTable,
  AddAsinModal,
  EditAsinModal,
  ExcelUploadModal,
  ScraperProgress,
} from '@/components/dashboard'
import type { AsinReport } from '@/lib/api'

export function Dashboard() {
  const { data: asins, isLoading, refetch } = useLatestAsins()
  const { data: scraperStatus } = useScraperStatus()
  const deleteAsin = useDeleteAsin()
  const toggleSnooze = useToggleAsinSnooze()
  const startScraper = useStartScraper()
  const stopScraper = useStopScraper()
  const { isConnected, progress } = useSocket()

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedAsin, setSelectedAsin] = useState<AsinReport | null>(null)
  const [asinToDelete, setAsinToDelete] = useState<string | null>(null)

  const stats = useMemo(() => {
    if (!asins) return { total: 0, available: 0, unavailable: 0, snoozed: 0 }

    return {
      total: asins.length,
      available: asins.filter((a) => a.available === true).length,
      unavailable: asins.filter((a) => a.available === false).length,
      snoozed: asins.filter((a) => a.snoozed).length,
    }
  }, [asins])

  const handleEdit = (asin: AsinReport) => {
    setSelectedAsin(asin)
    setEditModalOpen(true)
  }

  const handleDelete = (asin: string) => {
    setAsinToDelete(asin)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!asinToDelete) return
    await deleteAsin.mutateAsync(asinToDelete)
    setDeleteModalOpen(false)
    setAsinToDelete(null)
  }

  const handleToggleSnooze = async (asin: string) => {
    await toggleSnooze.mutateAsync(asin)
  }

  const handleRunChecker = () => {
    if (scraperStatus?.running) {
      stopScraper.mutate()
    } else {
      startScraper.mutate()
    }
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Dashboard"
        description="Overview of your Amazon product tracking"
        actions={
          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="flex items-center gap-1 text-sm text-muted">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 text-success" />
                  <span className="hidden sm:inline">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-danger" />
                  <span className="hidden sm:inline">Disconnected</span>
                </>
              )}
            </div>

            <Button variant="outline" onClick={() => setUploadModalOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="outline" onClick={() => setAddModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Add ASIN</span>
            </Button>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              onClick={handleRunChecker}
              variant={scraperStatus?.running ? 'destructive' : 'default'}
              disabled={startScraper.isPending || stopScraper.isPending}
            >
              {scraperStatus?.running ? (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Stop</span>
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Run Checker</span>
                </>
              )}
            </Button>
          </div>
        }
      />

      {/* Scraper Progress */}
      <ScraperProgress progress={progress} />

      {/* Stats Cards */}
      <StatCardGrid columns={4}>
        <StatCard
          title="Total Products"
          value={stats.total}
          icon={<Package className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Available"
          value={stats.available}
          icon={<CheckCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Unavailable"
          value={stats.unavailable}
          icon={<XCircle className="h-6 w-6" />}
          isLoading={isLoading}
        />
        <StatCard
          title="Snoozed"
          value={stats.snoozed}
          icon={<Clock className="h-6 w-6" />}
          isLoading={isLoading}
        />
      </StatCardGrid>

      {/* Products Table */}
      <div className="mt-8">
        <DashboardTable
          data={asins ?? []}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleSnooze={handleToggleSnooze}
        />
      </div>

      {/* Modals */}
      <AddAsinModal open={addModalOpen} onOpenChange={setAddModalOpen} />
      <EditAsinModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        asin={selectedAsin}
      />
      <ExcelUploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
      <ConfirmModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Product"
        description={`Are you sure you want to delete ${asinToDelete}? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteAsin.isPending}
      />
    </PageWrapper>
  )
}
