import { useState } from 'react'
import { Plus, Trash2, Upload, Search } from 'lucide-react'
import { PageWrapper, PageHeader } from '@/components/layout'
import { ConfirmModal, QueryError, ExcelUploadModal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useProducts, useDeleteProduct, useBulkDeleteProducts, useUpdateProduct } from '@/hooks'
import { ProductsTable } from '@/components/products'
import { Modal } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Product } from '@/lib/api'
import { catalogApi, productsApi } from '@/lib/api'
import { useForm } from 'react-hook-form'
import { useAddAsin } from '@/hooks'

interface ProductFormFields {
  asin: string
  sku: string
  title: string
  brand: string
  upc: string
  vendor_code: string
  cost: string
  category: string
  subcategory: string
  comment: string
  notes: string
}

export function Products() {
  const { data: products, isLoading, isError, error, refetch } = useProducts()
  const deleteProduct = useDeleteProduct()
  const bulkDelete = useBulkDeleteProducts()
  const updateProduct = useUpdateProduct()
  const addAsin = useAddAsin()

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [productToDelete, setProductToDelete] = useState<string | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([])

  const [lookupLoading, setLookupLoading] = useState(false)

  const emptyFormValues: ProductFormFields = {
    asin: '', sku: '', title: '', brand: '', upc: '',
    vendor_code: '', cost: '', category: '', subcategory: '',
    comment: '', notes: '',
  }

  const addForm = useForm<ProductFormFields>({
    defaultValues: emptyFormValues,
  })

  const editForm = useForm<Omit<ProductFormFields, 'asin'>>({
    defaultValues: { sku: '', title: '', brand: '', upc: '', vendor_code: '', cost: '', category: '', subcategory: '', comment: '', notes: '' },
  })

  const handleEdit = (product: Product) => {
    setSelectedProduct(product)
    editForm.reset({
      sku: product.sku ?? '',
      title: product.title ?? '',
      brand: product.brand ?? '',
      upc: product.upc ?? '',
      vendor_code: product.vendor_code ?? '',
      cost: product.cost ?? '',
      category: product.category ?? '',
      subcategory: product.subcategory ?? '',
      comment: product.comment ?? '',
      notes: product.notes ?? '',
    })
    setEditModalOpen(true)
  }

  const handleDelete = (asin: string) => {
    setProductToDelete(asin)
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
    const asins = selectedProducts.map((p) => p.asin)
    await bulkDelete.mutateAsync(asins)
    setBulkDeleteModalOpen(false)
    setSelectedProducts([])
  }

  const handleAddSubmit = async (data: ProductFormFields) => {
    // Filter out empty strings before sending
    const filtered: Record<string, string> = { asin: data.asin }
    for (const [key, value] of Object.entries(data)) {
      if (key !== 'asin' && value && value.trim()) {
        filtered[key] = value.trim()
      }
    }
    await addAsin.mutateAsync(filtered as { asin: string; comment?: string })
    addForm.reset(emptyFormValues)
    setAddModalOpen(false)
  }

  const handleEditSubmit = async (data: Omit<ProductFormFields, 'asin'>) => {
    if (!selectedProduct) return
    // Filter out empty strings
    const filtered: Record<string, string> = {}
    for (const [key, value] of Object.entries(data)) {
      filtered[key] = value?.trim() ?? ''
    }
    await updateProduct.mutateAsync({
      asin: selectedProduct.asin,
      data: filtered,
    })
    setEditModalOpen(false)
  }

  const handleCatalogLookup = async () => {
    const asin = addForm.getValues('asin')?.trim().toUpperCase()
    if (!asin || asin.length !== 10) return

    setLookupLoading(true)
    try {
      // Try catalog_details first
      let catalogData: { title?: string; brand?: string; identifiers?: unknown } | null = null
      try {
        catalogData = await catalogApi.get(asin)
      } catch {
        // Not in DB, try SP-API refresh
        try {
          catalogData = await catalogApi.refresh(asin)
        } catch {
          // Ignore
        }
      }

      if (catalogData) {
        if (catalogData.title) addForm.setValue('title', catalogData.title)
        if (catalogData.brand) addForm.setValue('brand', catalogData.brand)
        // Extract UPC from identifiers JSONB
        const identifiers = catalogData.identifiers
        if (identifiers) {
          const idArray = Array.isArray(identifiers) ? identifiers : [identifiers]
          for (const id of idArray as Array<Record<string, unknown>>) {
            if (id.identifierType === 'UPC' || id.type === 'UPC') {
              addForm.setValue('upc', String(id.identifier ?? id.value ?? ''))
              break
            }
            // Check nested identifiers array
            const nested = id.identifiers as Array<Record<string, unknown>> | undefined
            if (nested) {
              for (const nid of nested) {
                if (nid.identifierType === 'UPC' || nid.type === 'UPC') {
                  addForm.setValue('upc', String(nid.identifier ?? nid.value ?? ''))
                  break
                }
              }
            }
          }
        }
      }

      // Also check products table for existing metadata
      try {
        const existing = await productsApi.get(asin)
        if (existing) {
          if (existing.sku && !addForm.getValues('sku')) addForm.setValue('sku', existing.sku)
          if (existing.comment && !addForm.getValues('comment')) addForm.setValue('comment', existing.comment)
        }
      } catch {
        // Not found, that's fine
      }
    } finally {
      setLookupLoading(false)
    }
  }

  if (isError) {
    return (
      <PageWrapper>
        <PageHeader
          title="Products"
          description="Manage your tracked products and ASINs"
        />
        <QueryError
          error={error}
          onRetry={() => refetch()}
          title="Failed to load products"
          description="There was a problem loading your products. Please try again."
        />
      </PageWrapper>
    )
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
            <Button variant="outline" onClick={() => setUploadModalOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
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
        size="lg"
      >
        <form onSubmit={addForm.handleSubmit(handleAddSubmit)} className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="add-asin">ASIN *</Label>
              <Input
                id="add-asin"
                placeholder="B08N5WRWNW"
                {...addForm.register('asin')}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={handleCatalogLookup} disabled={lookupLoading}>
                <Search className="mr-2 h-4 w-4" />
                {lookupLoading ? 'Looking up...' : 'Lookup'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="add-sku">SKU</Label>
              <Input id="add-sku" placeholder="Enter SKU..." {...addForm.register('sku')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-upc">UPC</Label>
              <Input id="add-upc" placeholder="Enter UPC..." {...addForm.register('upc')} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="add-title">Title</Label>
              <Input id="add-title" placeholder="Product title..." {...addForm.register('title')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-brand">Brand</Label>
              <Input id="add-brand" placeholder="Brand name..." {...addForm.register('brand')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-vendor-code">Vendor Code</Label>
              <Input id="add-vendor-code" placeholder="Vendor code..." {...addForm.register('vendor_code')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-cost">Cost</Label>
              <Input id="add-cost" placeholder="0.00" {...addForm.register('cost')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-category">Category</Label>
              <Input id="add-category" placeholder="Category..." {...addForm.register('category')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-subcategory">Subcategory</Label>
              <Input id="add-subcategory" placeholder="Subcategory..." {...addForm.register('subcategory')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-comment">Comment</Label>
              <Input id="add-comment" placeholder="Add a note..." {...addForm.register('comment')} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="add-notes">Notes</Label>
              <Input id="add-notes" placeholder="Additional notes..." {...addForm.register('notes')} />
            </div>
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
        size="lg"
      >
        <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-asin">ASIN</Label>
            <Input id="edit-asin" value={selectedProduct?.asin ?? ''} disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-sku">SKU</Label>
              <Input id="edit-sku" placeholder="Enter SKU..." {...editForm.register('sku')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-upc">UPC</Label>
              <Input id="edit-upc" placeholder="Enter UPC..." {...editForm.register('upc')} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" placeholder="Product title..." {...editForm.register('title')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-brand">Brand</Label>
              <Input id="edit-brand" placeholder="Brand name..." {...editForm.register('brand')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-vendor-code">Vendor Code</Label>
              <Input id="edit-vendor-code" placeholder="Vendor code..." {...editForm.register('vendor_code')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cost">Cost</Label>
              <Input id="edit-cost" placeholder="0.00" {...editForm.register('cost')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <Input id="edit-category" placeholder="Category..." {...editForm.register('category')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subcategory">Subcategory</Label>
              <Input id="edit-subcategory" placeholder="Subcategory..." {...editForm.register('subcategory')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-comment">Comment</Label>
              <Input id="edit-comment" placeholder="Add a note..." {...editForm.register('comment')} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input id="edit-notes" placeholder="Additional notes..." {...editForm.register('notes')} />
            </div>
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

      {/* Excel Upload Modal */}
      <ExcelUploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
    </PageWrapper>
  )
}
