import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { ConfirmModal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useProducts, useDeleteProduct, useBulkDeleteProducts, useUpdateProduct } from '@/hooks'
import { ProductsTable } from '@/components/products'
import { Modal } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Product } from '@/lib/api'
import { useForm } from 'react-hook-form'
import { useAddAsin } from '@/hooks'

export function Products() {
  const { data: products, isLoading } = useProducts()
  const deleteProduct = useDeleteProduct()
  const bulkDelete = useBulkDeleteProducts()
  const updateProduct = useUpdateProduct()
  const addAsin = useAddAsin()

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [productToDelete, setProductToDelete] = useState<number | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([])

  const addForm = useForm<{ asin: string; comment: string }>({
    defaultValues: { asin: '', comment: '' },
  })

  const editForm = useForm<{ comment: string }>({
    defaultValues: { comment: '' },
  })

  const handleEdit = (product: Product) => {
    setSelectedProduct(product)
    editForm.reset({ comment: product.comment ?? '' })
    setEditModalOpen(true)
  }

  const handleDelete = (id: number) => {
    setProductToDelete(id)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!productToDelete) return
    await deleteProduct.mutateAsync(productToDelete)
    setDeleteModalOpen(false)
    setProductToDelete(null)
  }

  const handleBulkDelete = () => {
    if (selectedProducts.length === 0) return
    setBulkDeleteModalOpen(true)
  }

  const confirmBulkDelete = async () => {
    const ids = selectedProducts.map((p) => p.id)
    await bulkDelete.mutateAsync(ids)
    setBulkDeleteModalOpen(false)
    setSelectedProducts([])
  }

  const handleAddSubmit = async (data: { asin: string; comment: string }) => {
    await addAsin.mutateAsync(data)
    addForm.reset()
    setAddModalOpen(false)
  }

  const handleEditSubmit = async (data: { comment: string }) => {
    if (!selectedProduct) return
    await updateProduct.mutateAsync({
      id: selectedProduct.id,
      data: { comment: data.comment },
    })
    setEditModalOpen(false)
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Products"
        description="Manage your tracked products and ASINs"
        actions={
          <div className="flex gap-3">
            {selectedProducts.length > 0 && (
              <Button variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete ({selectedProducts.length})
              </Button>
            )}
            <Button onClick={() => setAddModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </div>
        }
      />

      <ProductsTable
        data={products ?? []}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onSelectionChange={setSelectedProducts}
      />

      {/* Add Product Modal */}
      <Modal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        title="Add Product"
        description="Add a new ASIN to track"
        size="sm"
      >
        <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-asin">ASIN</Label>
            <Input
              id="add-asin"
              placeholder="B08N5WRWNW"
              {...addForm.register('asin')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-comment">Comment (optional)</Label>
            <Input
              id="add-comment"
              placeholder="Add a note..."
              {...addForm.register('comment')}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addAsin.isPending}>
              {addAsin.isPending ? 'Adding...' : 'Add Product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        title="Edit Product"
        description={selectedProduct ? `Editing ${selectedProduct.asin}` : ''}
        size="sm"
      >
        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-asin">ASIN</Label>
            <Input id="edit-asin" value={selectedProduct?.asin ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-comment">Comment</Label>
            <Input
              id="edit-comment"
              placeholder="Add a note..."
              {...editForm.register('comment')}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateProduct.isPending}>
              {updateProduct.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete Product"
        description="Are you sure you want to delete this product? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        isLoading={deleteProduct.isPending}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        open={bulkDeleteModalOpen}
        onOpenChange={setBulkDeleteModalOpen}
        title="Delete Products"
        description={`Are you sure you want to delete ${selectedProducts.length} products? This action cannot be undone.`}
        confirmText="Delete All"
        variant="destructive"
        onConfirm={confirmBulkDelete}
        isLoading={bulkDelete.isPending}
      />
    </PageWrapper>
  )
}
