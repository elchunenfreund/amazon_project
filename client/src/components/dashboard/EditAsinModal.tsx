import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Modal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpdateAsinComment } from '@/hooks'
import type { AsinReport } from '@/lib/api'

interface EditAsinForm {
  comment: string
}

interface EditAsinModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asin: AsinReport | null
}

export function EditAsinModal({ open, onOpenChange, asin }: EditAsinModalProps) {
  const updateComment = useUpdateAsinComment()

  const form = useForm<EditAsinForm>({
    defaultValues: { comment: '' },
  })

  useEffect(() => {
    if (asin) {
      form.reset({ comment: asin.comment ?? '' })
    }
  }, [asin, form])

  const handleSubmit = async (data: EditAsinForm) => {
    if (!asin) return

    try {
      await updateComment.mutateAsync({ asin: asin.asin, comment: data.comment })
      onOpenChange(false)
    } catch {
      // Error handled by mutation
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Product"
      description={asin ? `Editing ${asin.asin}` : ''}
      size="sm"
    >
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="edit-asin">ASIN</Label>
          <Input id="edit-asin" value={asin?.asin ?? ''} disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-title">Title</Label>
          <Input id="edit-title" value={asin?.title ?? '-'} disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="edit-comment">Comment</Label>
          <Input
            id="edit-comment"
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
          <Button type="submit" disabled={updateComment.isPending}>
            {updateComment.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
