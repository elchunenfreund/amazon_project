import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Filter, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type StatusTag = 'in_stock' | 'unavailable' | 'back_ordered' | 'doggy' | 'pending'

const STATUS_TAGS: { value: StatusTag; label: string; color: string }[] = [
  { value: 'in_stock', label: 'In Stock', color: 'bg-emerald-600' },
  { value: 'unavailable', label: 'Unavailable', color: 'bg-rose-600' },
  { value: 'back_ordered', label: 'Back Ordered', color: 'bg-amber-500' },
  { value: 'doggy', label: 'Doggy', color: 'bg-purple-600' },
  { value: 'pending', label: 'Pending', color: 'bg-slate-400' },
]

interface StatusFilterPopoverProps {
  selectAll: boolean
  selectedStatuses: Set<StatusTag>
  onChange: (selectAll: boolean, statuses: Set<StatusTag>) => void
}

export function StatusFilterPopover({
  selectAll,
  selectedStatuses,
  onChange,
}: StatusFilterPopoverProps) {
  const handleSelectAllChange = (checked: boolean) => {
    if (checked) {
      // When Select All is checked, clear individual selections
      onChange(true, new Set())
    } else {
      // Don't allow unchecking Select All without selecting something else
      // This prevents having nothing selected
    }
  }

  const handleStatusChange = (status: StatusTag, checked: boolean) => {
    const newStatuses = new Set(selectedStatuses)

    if (checked) {
      // Add the status and turn off Select All
      newStatuses.add(status)
      onChange(false, newStatuses)
    } else {
      // Remove the status
      newStatuses.delete(status)

      // If no statuses selected, turn Select All back on
      if (newStatuses.size === 0) {
        onChange(true, new Set())
      } else {
        onChange(false, newStatuses)
      }
    }
  }

  // Determine display label
  const getDisplayLabel = () => {
    if (selectAll) return 'All Status'
    if (selectedStatuses.size === 1) {
      const status = Array.from(selectedStatuses)[0]
      return STATUS_TAGS.find(t => t.value === status)?.label || 'Status'
    }
    if (selectedStatuses.size > 1) {
      return `${selectedStatuses.size} statuses`
    }
    return 'Status'
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[150px] justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted" />
            <span className="truncate">{getDisplayLabel()}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-3" align="start">
        <div className="space-y-3">
          {/* Select All option */}
          <div className="flex items-center gap-2 pb-2 border-b">
            <Checkbox
              id="status-all"
              checked={selectAll}
              onCheckedChange={handleSelectAllChange}
            />
            <Label
              htmlFor="status-all"
              className="cursor-pointer text-sm font-medium"
            >
              Select All
            </Label>
          </div>

          {/* Individual status options */}
          <div className="space-y-2">
            {STATUS_TAGS.map((tag) => (
              <div key={tag.value} className="flex items-center gap-2">
                <Checkbox
                  id={`status-${tag.value}`}
                  checked={selectedStatuses.has(tag.value)}
                  onCheckedChange={(checked) =>
                    handleStatusChange(tag.value, checked as boolean)
                  }
                />
                <Label
                  htmlFor={`status-${tag.value}`}
                  className="cursor-pointer text-sm flex items-center gap-2"
                >
                  <span className={cn('w-2.5 h-2.5 rounded-full', tag.color)} />
                  {tag.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
