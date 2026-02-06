import { useState, useCallback, useMemo } from 'react'
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle, Table } from 'lucide-react'
import { Modal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useBulkAddAsinsWithMetadata } from '@/hooks'
import { isFileReaderString } from '@/lib/type-guards'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ExcelUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface ProductData {
  asin: string
  sku?: string
  title?: string
  brand?: string
  upc?: string
  vendor_code?: string
  cost?: string
  category?: string
  subcategory?: string
  comment?: string
  notes?: string
}

// Mapping of possible header names to product fields
const HEADER_MAPPINGS: Record<string, keyof ProductData> = {
  'asin': 'asin',
  'product asin': 'asin',
  'amazon asin': 'asin',
  'sku': 'sku',
  'vendor sku': 'sku',
  'product sku': 'sku',
  'item sku': 'sku',
  'title': 'title',
  'product title': 'title',
  'product name': 'title',
  'name': 'title',
  'item name': 'title',
  'brand': 'brand',
  'brand name': 'brand',
  'manufacturer': 'brand',
  'upc': 'upc',
  'upc code': 'upc',
  'barcode': 'upc',
  'vendor code': 'vendor_code',
  'vendor_code': 'vendor_code',
  'vendorcode': 'vendor_code',
  'cost': 'cost',
  'unit cost': 'cost',
  'price': 'cost',
  'category': 'category',
  'product category': 'category',
  'subcategory': 'subcategory',
  'sub category': 'subcategory',
  'sub-category': 'subcategory',
  'comment': 'comment',
  'comments': 'comment',
  'notes': 'notes',
  'note': 'notes',
}

const FIELD_LABELS: Record<keyof ProductData, string> = {
  asin: 'ASIN',
  sku: 'SKU',
  title: 'Title',
  brand: 'Brand',
  upc: 'UPC',
  vendor_code: 'Vendor Code',
  cost: 'Cost',
  category: 'Category',
  subcategory: 'Subcategory',
  comment: 'Comment',
  notes: 'Notes',
}

export function ExcelUploadModal({ open, onOpenChange }: ExcelUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawData, setRawData] = useState<string[][]>([])
  const [columnMappings, setColumnMappings] = useState<Record<number, keyof ProductData | ''>>({})
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload')

  const bulkAddWithMetadata = useBulkAddAsinsWithMetadata()

  // Parse CSV/Excel content
  const parseContent = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length === 0) {
      setError('File is empty')
      return
    }

    // Parse first line as headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase())
    setRawHeaders(headers)

    // Parse remaining lines as data
    const data = lines.slice(1).map(line => {
      // Simple CSV parsing (handles quoted values)
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())
      return values
    }).filter(row => row.some(v => v))
    setRawData(data)

    // Auto-detect column mappings
    const mappings: Record<number, keyof ProductData | ''> = {}
    headers.forEach((header, index) => {
      const normalizedHeader = header.toLowerCase().trim()
      if (HEADER_MAPPINGS[normalizedHeader]) {
        mappings[index] = HEADER_MAPPINGS[normalizedHeader]
      } else {
        // Check if header contains a known field name
        for (const [pattern, field] of Object.entries(HEADER_MAPPINGS)) {
          if (normalizedHeader.includes(pattern)) {
            mappings[index] = field
            break
          }
        }
      }
    })
    setColumnMappings(mappings)

    // If no ASIN column detected, try to find it in data
    const asinColumnIndex = Object.entries(mappings).find(([, field]) => field === 'asin')?.[0]
    if (!asinColumnIndex) {
      // Look for a column with ASIN-like values (10 alphanumeric)
      for (let col = 0; col < headers.length; col++) {
        const hasAsins = data.slice(0, 5).some(row => /^[A-Z0-9]{10}$/i.test(row[col] || ''))
        if (hasAsins) {
          mappings[col] = 'asin'
          break
        }
      }
      setColumnMappings(mappings)
    }

    setStep('mapping')
    setError(null)
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)
    setFile(selectedFile)
    setStep('upload')

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (!isFileReaderString(result)) {
        setError('Failed to read file')
        return
      }
      parseContent(result)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(selectedFile)
  }, [parseContent])

  const updateColumnMapping = (columnIndex: number, field: keyof ProductData | '') => {
    setColumnMappings(prev => ({ ...prev, [columnIndex]: field }))
  }

  // Convert raw data to ProductData using mappings
  const parsedProducts = useMemo(() => {
    const products: ProductData[] = []
    const asinColumn = Object.entries(columnMappings).find(([, field]) => field === 'asin')?.[0]

    if (!asinColumn) return products

    for (const row of rawData) {
      const asin = row[parseInt(asinColumn)]?.trim().toUpperCase()
      if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) continue

      const product: ProductData = { asin }
      for (const [colIndex, field] of Object.entries(columnMappings)) {
        if (field && field !== 'asin') {
          const value = row[parseInt(colIndex)]?.trim()
          if (value) {
            product[field] = value
          }
        }
      }
      products.push(product)
    }

    // Deduplicate by ASIN
    const seen = new Set<string>()
    return products.filter(p => {
      if (seen.has(p.asin)) return false
      seen.add(p.asin)
      return true
    })
  }, [rawData, columnMappings])

  const hasAsinMapping = Object.values(columnMappings).includes('asin')
  const mappedFieldCount = Object.values(columnMappings).filter(v => v).length

  const handleUpload = async () => {
    if (parsedProducts.length === 0) return

    try {
      await bulkAddWithMetadata.mutateAsync(parsedProducts)
      handleClose()
    } catch {
      // Error handled by mutation
    }
  }

  const handleClose = () => {
    setFile(null)
    setRawHeaders([])
    setRawData([])
    setColumnMappings({})
    setError(null)
    setStep('upload')
    onOpenChange(false)
  }

  const handleRemoveProduct = (asin: string) => {
    setRawData(prev => prev.filter(row => {
      const asinCol = Object.entries(columnMappings).find(([, f]) => f === 'asin')?.[0]
      return asinCol ? row[parseInt(asinCol)]?.toUpperCase() !== asin : true
    }))
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Import from Excel/CSV"
      description={step === 'upload' ? 'Upload a file containing product data' : step === 'mapping' ? 'Map columns to product fields' : 'Review and import products'}
      size="lg"
    >
      <div className="space-y-4">
        {/* Step 1: File Upload */}
        {step === 'upload' && (
          <div
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
              file ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
            }`}
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              onChange={handleFileChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            <Upload className="mb-4 h-10 w-10 text-muted" />
            <p className="text-center text-muted">
              Drop your CSV or Excel file here, or click to browse
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Supports .csv, .xlsx, .xls files with headers
            </p>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Columns: ASIN, SKU, Title, Brand, UPC, Vendor Code, Cost, Category, Subcategory, Comment, Notes
            </p>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 'mapping' && (
          <>
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-accent" />
              <div>
                <p className="font-medium">{file?.name}</p>
                <p className="text-sm text-muted">
                  {rawData.length} rows, {rawHeaders.length} columns
                </p>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="mb-3 font-medium flex items-center gap-2">
                <Table className="h-4 w-4" />
                Column Mapping
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {rawHeaders.map((header, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-32 truncate text-sm" title={header}>
                      {header || `Column ${index + 1}`}
                    </span>
                    <Select
                      value={columnMappings[index] || ''}
                      onValueChange={(value) => updateColumnMapping(index, value as keyof ProductData | '')}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Skip</SelectItem>
                        {Object.entries(FIELD_LABELS).map(([field, label]) => (
                          <SelectItem
                            key={field}
                            value={field}
                            disabled={Object.values(columnMappings).includes(field as keyof ProductData) && columnMappings[index] !== field}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {columnMappings[index] === 'asin' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                ))}
              </div>

              {!hasAsinMapping && (
                <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Please map at least the ASIN column
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={() => setStep('preview')}
                disabled={!hasAsinMapping || parsedProducts.length === 0}
              >
                Preview ({parsedProducts.length} products)
              </Button>
            </div>
          </>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-accent" />
                <div>
                  <p className="font-medium">{parsedProducts.length} Products to Import</p>
                  <p className="text-sm text-muted">
                    {mappedFieldCount} fields mapped
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-64 overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">ASIN</th>
                    <th className="px-3 py-2 text-left font-medium">SKU</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Brand</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedProducts.slice(0, 50).map((product) => (
                    <tr key={product.asin} className="border-t">
                      <td className="px-3 py-2 font-mono">{product.asin}</td>
                      <td className="px-3 py-2 text-muted">{product.sku || '-'}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={product.title}>
                        {product.title || '-'}
                      </td>
                      <td className="px-3 py-2 text-muted">{product.brand || '-'}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveProduct(product.asin)}
                          className="rounded p-1 hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedProducts.length > 50 && (
                <div className="px-3 py-2 text-center text-sm text-muted bg-muted/30">
                  ... and {parsedProducts.length - 50} more
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={parsedProducts.length === 0 || bulkAddWithMetadata.isPending}
                >
                  {bulkAddWithMetadata.isPending
                    ? 'Importing...'
                    : `Import ${parsedProducts.length} Products`}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
