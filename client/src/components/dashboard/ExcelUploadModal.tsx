import { useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { useBulkAddAsins } from '@/hooks'

interface ExcelUploadModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExcelUploadModal({ open, onOpenChange }: ExcelUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [parsedAsins, setParsedAsins] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const bulkAddAsins = useBulkAddAsins()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)
    setFile(selectedFile)

    // Read CSV/Excel file
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) {
        setError('Failed to read file')
        return
      }

      // Parse CSV - look for ASIN column or first column
      const lines = text.split(/\r?\n/).filter((line) => line.trim())
      const asins: string[] = []

      for (const line of lines) {
        const columns = line.split(',').map((col) => col.trim().replace(/"/g, ''))

        // Check each column for valid ASIN pattern (10 alphanumeric characters)
        for (const col of columns) {
          if (/^[A-Z0-9]{10}$/i.test(col)) {
            asins.push(col.toUpperCase())
            break // Only take first ASIN per row
          }
        }
      }

      if (asins.length === 0) {
        setError('No valid ASINs found in file. ASINs should be 10 alphanumeric characters.')
        return
      }

      // Remove duplicates
      const uniqueAsins = [...new Set(asins)]
      setParsedAsins(uniqueAsins)
    }

    reader.onerror = () => {
      setError('Failed to read file')
    }

    reader.readAsText(selectedFile)
  }, [])

  const handleUpload = async () => {
    if (parsedAsins.length === 0) return

    try {
      await bulkAddAsins.mutateAsync(parsedAsins)
      handleClose()
    } catch {
      // Error handled by mutation
    }
  }

  const handleClose = () => {
    setFile(null)
    setParsedAsins([])
    setError(null)
    onOpenChange(false)
  }

  const handleRemoveAsin = (asin: string) => {
    setParsedAsins((prev) => prev.filter((a) => a !== asin))
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Import from Excel/CSV"
      description="Upload a file containing ASINs to bulk import"
      size="lg"
    >
      <div className="space-y-4">
        {/* File Drop Zone */}
        <div
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
            file ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
          }`}
        >
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
          {file ? (
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-10 w-10 text-accent" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted">
                  {parsedAsins.length} ASINs found
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="mb-4 h-10 w-10 text-muted" />
              <p className="text-center text-muted">
                Drop your CSV or Excel file here, or click to browse
              </p>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                Supports .csv, .xlsx, .xls files
              </p>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Parsed ASINs Preview */}
        {parsedAsins.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">ASINs to import ({parsedAsins.length})</p>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
              <div className="flex flex-wrap gap-2">
                {parsedAsins.map((asin) => (
                  <div
                    key={asin}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm"
                  >
                    <span className="font-mono">{asin}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAsin(asin)}
                      className="ml-1 rounded-full p-0.5 hover:bg-slate-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={parsedAsins.length === 0 || bulkAddAsins.isPending}
          >
            {bulkAddAsins.isPending
              ? 'Importing...'
              : `Import ${parsedAsins.length} ASINs`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
