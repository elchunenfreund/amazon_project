/**
 * Type guard utilities for runtime type validation.
 * These help replace unsafe `as` type assertions with proper runtime checks.
 */

/**
 * Checks if a value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Checks if a value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/**
 * Checks if a value is a number (including handling potential string numbers)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value)
}

/**
 * Safely converts a value to a number, returning null if invalid
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
  return null
}

/**
 * Formats a numeric value for display in Recharts tooltips.
 * Handles the case where Recharts passes value as number | string | Array.
 */
export function formatTooltipValue(
  value: unknown,
  formatter: (num: number) => string
): string {
  const num = toNumber(value)
  if (num !== null) {
    return formatter(num)
  }
  return '-'
}

/**
 * Type guard for FileReader result being a string
 */
export function isFileReaderString(result: unknown): result is string {
  return typeof result === 'string'
}

/**
 * Type guard to check if a value is one of the allowed values in a const array
 */
export function isOneOf<T extends readonly unknown[]>(
  value: unknown,
  allowedValues: T
): value is T[number] {
  return allowedValues.includes(value as T[number])
}

/**
 * Type guard for checking if an object has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is { [P in K]: unknown } {
  return isObject(obj) && key in obj
}

/**
 * Type guard for checking if an object has all required properties
 */
export function hasProperties<K extends string>(
  obj: unknown,
  keys: K[]
): obj is { [P in K]: unknown } {
  return isObject(obj) && keys.every((key) => key in obj)
}

/**
 * Safely access a property from an object, returning undefined if not valid
 */
export function safeGet<T>(
  obj: unknown,
  key: string,
  validator?: (value: unknown) => value is T
): T | undefined {
  if (!isObject(obj) || !(key in obj)) {
    return undefined
  }
  const value = obj[key]
  if (validator) {
    return validator(value) ? value : undefined
  }
  return value as T
}

/**
 * Type guard for AsinReport from the API
 */
export interface AsinReportShape {
  asin: string
  available?: boolean
  price?: number | null
  price_change?: number | null
  seller?: string
}

export function isAsinReport(value: unknown): value is AsinReportShape {
  return (
    isObject(value) &&
    'asin' in value &&
    typeof value.asin === 'string'
  )
}

/**
 * Type guard for VendorReport from the API
 */
export interface VendorReportShape {
  asin: string
  conversion_rate?: number
  sell_through_rate?: number
  vendor_confirmation_rate?: number
  receive_fill_rate?: number
  average_vendor_lead_time_days?: number
  open_purchase_order_units?: number
  net_received_inventory_units?: number
  unsellable_on_hand_inventory?: number
  aged_90_plus_inventory_units?: number
  customer_returns?: number
}

export function isVendorReport(value: unknown): value is VendorReportShape {
  return (
    isObject(value) &&
    'asin' in value &&
    typeof value.asin === 'string'
  )
}

/**
 * Type guard for AsinSummary
 */
export interface AsinSummaryShape {
  asin: string
  avgConversion: number
}

export function isAsinSummary(value: unknown): value is AsinSummaryShape {
  return (
    isObject(value) &&
    'asin' in value &&
    typeof value.asin === 'string' &&
    'avgConversion' in value &&
    typeof value.avgConversion === 'number'
  )
}
