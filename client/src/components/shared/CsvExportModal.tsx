import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { isObject } from '@/lib/type-guards'

interface Column {
  key: string
  header: string
  accessor?: (row: unknown) => string | number | null | undefined
}

interface CsvExportModalProps {
  data: unknown[]
  columns: Column[]
  filename?: string
  disabled?: boolean
}

export function CsvExportModal({
  data,
  columns,
  filename = 'export',
  disabled = false,
}: CsvExportModalProps) {
  const [open, setOpen] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(columns.map((c) => String(c.key)))
  )

  const handleToggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedColumns(new Set(columns.map((c) => String(c.key))))
  }

  const handleDeselectAll = () => {
    setSelectedColumns(new Set())
  }

  const selectedColumnsArray = useMemo(() => {
    return columns.filter((c) => selectedColumns.has(String(c.key)))
  }, [columns, selectedColumns])

  const handleExport = () => {
    if (data.length === 0 || selectedColumnsArray.length === 0) return

    const headers = selectedColumnsArray.map((c) => c.header)
    const rows = data.map((row) =>
      selectedColumnsArray.map((col) => {
        let value: string | number | null | undefined
        if (col.accessor) {
          value = col.accessor(row)
        } else if (isObject(row)) {
          const rawValue = row[col.key]
          // Only accept string or number values from the row object
          if (typeof rawValue === 'string' || typeof rawValue === 'number') {
            value = rawValue
          } else if (rawValue === null || rawValue === undefined) {
            value = rawValue
          } else {
            value = String(rawValue)
          }
        }
        if (value == null) return ''
        return String(value)
      })
    )

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled || data.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to CSV</DialogTitle>
          <DialogDescription>
            Select the columns you want to include in the export.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="mb-4 flex gap-4">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeselectAll}>
              Deselect All
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
            {columns.map((col) => (
              <div key={String(col.key)} className="flex items-center space-x-2">
                <Checkbox
                  id={String(col.key)}
                  checked={selectedColumns.has(String(col.key))}
                  onCheckedChange={() => handleToggleColumn(String(col.key))}
                />
                <Label
                  htmlFor={String(col.key)}
                  className="text-sm font-normal cursor-pointer"
                >
                  {col.header}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={selectedColumnsArray.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export ({data.length} rows)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
