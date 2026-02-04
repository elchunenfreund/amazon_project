import { useState, useRef, useEffect, useCallback, memo } from 'react'
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight, Minimize2, Maximize2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  searchPlaceholder?: string
  searchColumn?: string
  enableRowSelection?: boolean
  enableColumnVisibility?: boolean
  enablePagination?: boolean
  pageSize?: number
  pageSizeOptions?: number[]
  onRowSelectionChange?: (rows: TData[]) => void
  rowSelection?: RowSelectionState
  getRowClassName?: (row: { original: TData }) => string
  compactMode?: boolean
}

const DEFAULT_PAGE_SIZES = [20, 50, 100, 500, 1000]

// Threshold for disabling animations to improve performance with large datasets
const ANIMATION_ROW_THRESHOLD = 100

function DataTableInner<TData, TValue>({
  columns,
  data,
  isLoading = false,
  searchPlaceholder = 'Search...',
  searchColumn,
  enableRowSelection = false,
  enableColumnVisibility = false,
  enablePagination = true,
  pageSize = 20,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  onRowSelectionChange,
  rowSelection: controlledRowSelection,
  getRowClassName,
  compactMode: initialCompactMode = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = useState('')
  const [currentPageSize, setCurrentPageSize] = useState(pageSize)
  const [compactMode, setCompactMode] = useState(initialCompactMode)

  // Scroll shadow state
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollShadows = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    updateScrollShadows()
    container.addEventListener('scroll', updateScrollShadows)
    window.addEventListener('resize', updateScrollShadows)

    // Also check after data loads
    const observer = new MutationObserver(updateScrollShadows)
    observer.observe(container, { childList: true, subtree: true })

    return () => {
      container.removeEventListener('scroll', updateScrollShadows)
      window.removeEventListener('resize', updateScrollShadows)
      observer.disconnect()
    }
  }, [updateScrollShadows, data])

  // Use controlled row selection if provided, otherwise use internal state
  const rowSelection = controlledRowSelection ?? internalRowSelection
  const setRowSelection = setInternalRowSelection

  const tableColumns = enableRowSelection
    ? [
        {
          id: 'select',
          header: ({ table }: { table: ReturnType<typeof useReactTable<TData>> }) => (
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && 'indeterminate')
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Select all"
            />
          ),
          cell: ({ row }: { row: { getIsSelected: () => boolean; toggleSelected: (value?: boolean) => void } }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
            />
          ),
          enableSorting: false,
          enableHiding: false,
        } as ColumnDef<TData, TValue>,
        ...columns,
      ]
    : columns

  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: enablePagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: (updater) => {
      setRowSelection(updater)
      if (onRowSelectionChange) {
        const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater
        const selectedRows = Object.keys(newSelection)
          .filter((key) => newSelection[key])
          .map((key) => data[parseInt(key)])
        onRowSelectionChange(selectedRows)
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: currentPageSize,
      },
    },
  })

  // Handle page size change
  const handlePageSizeChange = (size: string) => {
    const newSize = parseInt(size, 10)
    setCurrentPageSize(newSize)
    table.setPageSize(newSize)
  }

  if (isLoading) {
    return <DataTableSkeleton columns={columns.length} rows={currentPageSize} />
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {searchColumn ? (
          <Input
            placeholder={searchPlaceholder}
            value={String(table.getColumn(searchColumn)?.getFilterValue() ?? '')}
            onChange={(event) =>
              table.getColumn(searchColumn)?.setFilterValue(event.target.value)
            }
            className="max-w-sm"
          />
        ) : (
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter ?? ''}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Compact mode toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompactMode(!compactMode)}
            title={compactMode ? "Expand view" : "Compact view"}
            aria-label={compactMode ? "Expand view" : "Compact view"}
          >
            {compactMode ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>

          {enableColumnVisibility && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Columns <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="relative">
        {/* Left scroll shadow */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-6 pointer-events-none z-20 transition-opacity duration-200",
            canScrollLeft ? "opacity-100" : "opacity-0"
          )}
          style={{
            background: 'linear-gradient(to right, rgba(0,0,0,0.08) 0%, transparent 100%)',
            boxShadow: '4px 0 8px rgba(0,0,0,0.1)'
          }}
        />
        {/* Right scroll shadow */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-6 pointer-events-none z-20 transition-opacity duration-200",
            canScrollRight ? "opacity-100" : "opacity-0"
          )}
          style={{
            background: 'linear-gradient(to left, rgba(0,0,0,0.08) 0%, transparent 100%)',
            boxShadow: '-4px 0 8px rgba(0,0,0,0.1)'
          }}
        />
        {/* Determine if we should animate based on row count for performance */}
        {(() => {
          const shouldAnimate = table.getRowModel().rows.length <= ANIMATION_ROW_THRESHOLD
          return (
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto rounded-md border border-border w-full"
          style={!shouldAnimate ? { contentVisibility: 'auto' } : undefined}
        >
        <Table className={cn(compactMode && "text-xs")}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className={cn(compactMode && "py-1 px-2 text-xs")}>
                      {header.isPlaceholder ? null : (
                        <div
                          className={cn(
                            'flex items-center gap-1 whitespace-nowrap',
                            header.column.getCanSort() && 'cursor-pointer select-none'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className="text-muted-foreground">
                              {header.column.getIsSorted() === 'desc' ? (
                                <ChevronDown className={cn(compactMode ? "h-3 w-3" : "h-4 w-4")} />
                              ) : header.column.getIsSorted() === 'asc' ? (
                                <ChevronUp className={cn(compactMode ? "h-3 w-3" : "h-4 w-4")} />
                              ) : (
                                <ChevronsUpDown className={cn(compactMode ? "h-3 w-3" : "h-4 w-4")} />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {shouldAnimate ? (
              // Animated rows for smaller datasets
              <AnimatePresence>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100",
                        getRowClassName?.(row)
                      )}
                      data-state={row.getIsSelected() && 'selected'}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cn(compactMode && "py-1 px-2")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </motion.tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={tableColumns.length}
                      className="h-24 text-center text-muted"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </AnimatePresence>
            ) : (
              // Non-animated rows for large datasets (performance optimization)
              <>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "hover:bg-slate-100/50 data-[state=selected]:bg-slate-100",
                        getRowClassName?.(row)
                      )}
                      data-state={row.getIsSelected() && 'selected'}
                      style={{ willChange: 'transform' }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className={cn(compactMode && "py-1 px-2")}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={tableColumns.length}
                      className="h-24 text-center text-muted"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
        </div>
          )
        })()}
      </div>

      {/* Pagination */}
      {enablePagination && (
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted">
              {enableRowSelection && (
                <span>
                  {table.getFilteredSelectedRowModel().rows.length} of{' '}
                  {table.getFilteredRowModel().rows.length} row(s) selected.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Rows per page:</span>
              <Select value={String(currentPageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center space-x-6 lg:space-x-8">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-muted">
                Page {table.getState().pagination.pageIndex + 1} of{' '}
                {table.getPageCount()}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Memoized wrapper for DataTable - preserves generic types
export const DataTable = memo(DataTableInner) as typeof DataTableInner

function DataTableSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-[250px]" />
        <Skeleton className="h-10 w-[100px]" />
      </div>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: columns }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// Helper function for creating sortable column headers
export function createSortableHeader(title: string) {
  return title
}
