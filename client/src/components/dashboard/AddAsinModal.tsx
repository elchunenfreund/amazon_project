import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAddAsin, useBulkAddAsins } from '@/hooks'

const singleAsinSchema = z.object({
  asin: z.string().min(10, 'ASIN must be at least 10 characters').max(10, 'ASIN must be 10 characters'),
  comment: z.string().optional(),
})

type SingleAsinForm = z.infer<typeof singleAsinSchema>

interface AddAsinModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddAsinModal({ open, onOpenChange }: AddAsinModalProps) {
  const [tab, setTab] = useState<'single' | 'bulk'>('single')
  const [bulkAsins, setBulkAsins] = useState('')

  const addAsin = useAddAsin()
  const bulkAddAsins = useBulkAddAsins()

  const form = useForm<SingleAsinForm>({
    defaultValues: { asin: '', comment: '' },
  })

  const handleSingleSubmit = async (data: SingleAsinForm) => {
    try {
      await addAsin.mutateAsync(data)
      form.reset()
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  const handleBulkSubmit = async () => {
    const asins = bulkAsins
      .split(/[\n,]/)
      .map((a) => a.trim())
      .filter((a) => a.length === 10)

    if (asins.length === 0) return

    try {
      await bulkAddAsins.mutateAsync(asins)
      setBulkAsins('')
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  const isLoading = addAsin.isPending || bulkAddAsins.isPending

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add Product"
      description="Add a new ASIN to track"
      size="md"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'single' | 'bulk')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="single">Single ASIN</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Import</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-4">
          <form onSubmit={form.handleSubmit(handleSingleSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="asin">ASIN</Label>
              <Input
                id="asin"
                placeholder="B08N5WRWNW"
                {...form.register('asin')}
              />
              {form.formState.errors.asin && (
                <p className="text-sm text-danger">{form.formState.errors.asin.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Input
                id="comment"
                placeholder="Add a note..."
                {...form.register('comment')}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Adding...' : 'Add ASIN'}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-asins">ASINs (one per line or comma-separated)</Label>
            <textarea
              id="bulk-asins"
              className="flex min-h-[150px] w-full rounded-md border border-border bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="B08N5WRWNW&#10;B09XYZ1234&#10;B07ABC5678"
              value={bulkAsins}
              onChange={(e) => setBulkAsins(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleBulkSubmit} disabled={isLoading || !bulkAsins.trim()}>
              {isLoading ? 'Adding...' : 'Add ASINs'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Modal>
  )
}
