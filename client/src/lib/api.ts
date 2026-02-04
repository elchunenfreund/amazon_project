const API_BASE = '/api'

// CSRF token management
let csrfToken: string | null = null
let csrfTokenPromise: Promise<void> | null = null

/**
 * Fetches a CSRF token from the server and stores it for subsequent requests.
 * This should be called once on app initialization.
 */
export async function initCsrf(): Promise<void> {
  // Prevent multiple simultaneous fetches
  if (csrfTokenPromise) {
    return csrfTokenPromise
  }

  csrfTokenPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/csrf-token`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        csrfToken = data.csrfToken
      } else {
        console.warn('Failed to fetch CSRF token:', response.status)
      }
    } catch (error) {
      console.warn('Error fetching CSRF token:', error)
    } finally {
      csrfTokenPromise = null
    }
  })()

  return csrfTokenPromise
}

/**
 * Refreshes the CSRF token. Call this after login or if a request fails with 403.
 */
export async function refreshCsrfToken(): Promise<void> {
  csrfToken = null
  csrfTokenPromise = null
  return initCsrf()
}

/**
 * Gets the current CSRF token. Initializes if not already done.
 */
export function getCsrfToken(): string | null {
  return csrfToken
}

// App configuration cache
interface AppConfig {
  amazonDomain: string
}

let appConfig: AppConfig | null = null
let configPromise: Promise<AppConfig> | null = null

/**
 * Fetches app configuration from the server.
 * Caches the result for subsequent calls.
 */
export async function getAppConfig(): Promise<AppConfig> {
  if (appConfig) {
    return appConfig
  }

  if (configPromise) {
    return configPromise
  }

  configPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/config`, {
        credentials: 'include',
      })
      if (response.ok) {
        appConfig = await response.json()
        return appConfig!
      }
    } catch {
      // Fall through to default
    }
    // Default config if fetch fails
    appConfig = { amazonDomain: 'amazon.ca' }
    return appConfig
  })()

  return configPromise
}

/**
 * Gets the Amazon product URL for a given ASIN.
 * Uses cached config or defaults to amazon.ca if config not loaded.
 */
export function getAmazonProductUrl(asin: string): string {
  const domain = appConfig?.amazonDomain || 'amazon.ca'
  return `https://www.${domain}/dp/${asin}`
}

class ApiError extends Error {
  status: number
  statusText: string

  constructor(status: number, statusText: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
  }
}

async function handleResponse<T>(response: Response, url: string): Promise<T> {
  if (!response.ok) {
    // Handle 401 Unauthorized - redirect to login (except for auth-related URLs)
    if (response.status === 401 && !url.includes('/auth/')) {
      window.location.href = '/login'
      throw new ApiError(response.status, response.statusText, 'Session expired')
    }
    const text = await response.text()
    throw new ApiError(response.status, response.statusText, text || response.statusText)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json() as Promise<T>
  }
  // For non-JSON responses, return the text.
  // The caller should ensure T is compatible with string when expecting text responses.
  const text = await response.text()
  return text as T
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`

  // Build headers with CSRF token for state-changing methods
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  // Merge any provided headers
  if (options.headers) {
    const providedHeaders = options.headers
    if (providedHeaders instanceof Headers) {
      providedHeaders.forEach((value, key) => {
        headers[key] = value
      })
    } else if (Array.isArray(providedHeaders)) {
      providedHeaders.forEach(([key, value]) => {
        headers[key] = value
      })
    } else {
      Object.assign(headers, providedHeaders)
    }
  }

  // Include CSRF token for non-GET requests
  const method = options.method?.toUpperCase() || 'GET'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Ensure cookies are sent for session
  })

  // If we get a 403 CSRF error, refresh token and retry once
  if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const text = await response.text()
    if (text.includes('CSRF')) {
      await refreshCsrfToken()
      // Retry with new token - build headers the same way
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (options.headers) {
        const providedHeaders = options.headers
        if (providedHeaders instanceof Headers) {
          providedHeaders.forEach((value, key) => {
            retryHeaders[key] = value
          })
        } else if (Array.isArray(providedHeaders)) {
          providedHeaders.forEach(([key, value]) => {
            retryHeaders[key] = value
          })
        } else {
          Object.assign(retryHeaders, providedHeaders)
        }
      }

      if (csrfToken) {
        retryHeaders['X-CSRF-Token'] = csrfToken
      }
      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders,
        credentials: 'include',
      })
      return handleResponse<T>(retryResponse, url)
    }
    throw new ApiError(response.status, response.statusText, text || response.statusText)
  }

  return handleResponse<T>(response, url)
}

// Products API
export interface Product {
  asin: string
  header?: string  // Product title
  sku?: string
  comment?: string
  snoozed?: boolean
  snooze_until?: string
  last_po_date?: string
  created_at: string
  updated_at?: string
}

export interface DailyReport {
  id: number
  asin: string
  check_date: string
  check_time: string
  title?: string
  available?: boolean
  seller?: string
  price?: number
  ranking?: number
  buy_box?: string
  created_at: string
  // Vendor data (from vendor_reports)
  shipped_cogs?: number | null
  shipped_units?: number | null
  ordered_units?: number | null
  ordered_revenue?: number | null
  glance_views?: number | null
}

export const productsApi = {
  getAll: () => request<Product[]>('/products'),

  get: (asin: string) => request<Product>(`/products/${asin}`),

  create: (data: { asin: string; comment?: string }) =>
    request<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (asin: string, data: Partial<Product>) =>
    request<Product>(`/products/${asin}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (asin: string) =>
    request<void>(`/products/${asin}`, {
      method: 'DELETE',
    }),

  bulkDelete: (asins: string[]) =>
    request<void>('/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ asins }),
    }),
}

// ASINs API (for dashboard)
export interface AsinReport {
  asin: string
  sku?: string | null
  title?: string
  available?: boolean
  availability_status?: 'in_stock' | 'back_order' | 'unavailable'
  seller?: string
  price?: number | null
  previous_price?: number | null
  price_change?: number | null
  ranking?: number | null
  buy_box?: string
  check_date?: string
  check_time?: string
  comment?: string
  snoozed?: boolean
  snooze_until?: string
  // New fields for restored features
  shipped_units?: number | null
  shipped_revenue?: number | null
  glance_views?: number | null
  received_quantity?: number | null
  inbound_quantity?: number | null
  last_po_date?: string | null
  // Change tracking
  has_changes?: boolean
  changed_fields?: string[]
}

export interface AsinFilters {
  startDate?: string
  endDate?: string
  baselineDate?: string
}

export const asinsApi = {
  getLatest: (filters?: AsinFilters) => {
    const params = new URLSearchParams()
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.baselineDate) params.set('baselineDate', filters.baselineDate)
    const query = params.toString()
    return request<AsinReport[]>(`/asins/latest${query ? `?${query}` : ''}`)
  },

  add: (data: { asin: string; comment?: string }) =>
    request<{ success: boolean }>('/asins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  bulkAdd: (asins: string[]) =>
    request<{ success: boolean; added: number }>('/asins/bulk', {
      method: 'POST',
      body: JSON.stringify({ asins }),
    }),

  updateComment: (asin: string, comment: string) =>
    request<{ success: boolean }>(`/asins/${asin}/comment`, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    }),

  update: (asin: string, data: { comment?: string; sku?: string }) =>
    request<{ success: boolean }>(`/asins/${asin}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleSnooze: (asin: string) =>
    request<{ success: boolean; snoozed: boolean }>(`/asins/${asin}/snooze`, {
      method: 'POST',
    }),

  delete: (asin: string) =>
    request<{ success: boolean }>(`/asins/${asin}`, {
      method: 'DELETE',
    }),

  getHistory: (asin: string) =>
    request<DailyReport[]>(`/asins/${asin}/history`),

  runReportSelected: (asins: string[]) =>
    request<{ success: boolean; message: string }>('/run-report-selected', {
      method: 'POST',
      body: JSON.stringify({ asins }),
    }),
}

// Vendor Reports API
export interface VendorReport {
  id: number
  asin: string
  report_date: string
  report_type: string
  data_start_date?: string
  data_end_date?: string
  distributor_view?: string
  // Sales metrics (match Vendor Central)
  shipped_cogs?: number
  shipped_units?: number
  shipped_revenue?: number
  ordered_units?: number
  ordered_revenue?: number
  customer_returns?: number
  // Inventory & traffic metrics
  sellable_on_hand_inventory?: number
  glance_views?: number
  conversion_rate?: number
  created_at: string
}

export interface VendorReportFilters {
  startDate?: string
  endDate?: string
  asin?: string
  reportType?: string
  distributorView?: string
}

export const vendorReportsApi = {
  getAll: (filters?: VendorReportFilters) => {
    const params = new URLSearchParams()
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.asin) params.set('asin', filters.asin)
    if (filters?.reportType) params.set('reportType', filters.reportType)
    if (filters?.distributorView) params.set('distributorView', filters.distributorView)
    const query = params.toString()
    return request<VendorReport[]>(`/vendor-reports${query ? `?${query}` : ''}`)
  },

  sync: () =>
    request<{ success: boolean; message: string }>('/sp-api/sync-reports', {
      method: 'POST',
    }),

  getAsins: (filters?: VendorReportFilters) => {
    const params = new URLSearchParams()
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    const query = params.toString()
    return request<string[]>(`/vendor-reports/asins${query ? `?${query}` : ''}`)
  },

  getWeeks: (distributorView?: string) => {
    const params = new URLSearchParams()
    if (distributorView) params.set('distributorView', distributorView)
    const query = params.toString()
    return request<{ start: string; end: string }[]>(`/vendor-reports/weeks${query ? `?${query}` : ''}`)
  },
}

// Purchase Orders API
export interface PurchaseOrder {
  id: number
  po_number: string
  po_state: string
  order_date: string
  ship_window_start?: string
  ship_window_end?: string
  delivery_window_start?: string
  delivery_window_end?: string
  total_items?: number
  total_cost?: number
  vendor_code?: string
  created_at: string
  updated_at: string
}

export interface POLineItem {
  id: number
  po_id: number
  po_number: string
  asin: string
  sku?: string              // vendor_sku from DB
  external_id?: string
  title?: string
  ordered_quantity?: number
  ordered_unit_cost?: number
  received_quantity?: number
  acknowledged_status?: string
  created_at: string
}

export interface POFilters {
  startDate?: string
  endDate?: string
  state?: string
  vendorCode?: string
}

export const purchaseOrdersApi = {
  getAll: (filters?: POFilters) => {
    const params = new URLSearchParams()
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.state) params.set('state', filters.state)
    if (filters?.vendorCode) params.set('vendorCode', filters.vendorCode)
    const query = params.toString()
    return request<PurchaseOrder[]>(`/purchase-orders${query ? `?${query}` : ''}`)
  },

  get: (poNumber: string) =>
    request<PurchaseOrder & { line_items: POLineItem[] }>(`/purchase-orders/${poNumber}`),

  getLineItems: (poNumber: string) =>
    request<POLineItem[]>(`/purchase-orders/${poNumber}/items`),

  sync: () =>
    request<{ success: boolean; message: string }>('/sp-api/sync-orders', {
      method: 'POST',
    }),

  getCalendar: (year: number, month: number) =>
    request<Record<string, PurchaseOrder[]>>(`/purchase-orders/calendar/${year}/${month}`),

  getVendors: () => request<string[]>('/purchase-orders/vendors'),
}

// Catalog API
export interface CatalogItem {
  asin: string
  title?: string
  brand?: string
  manufacturer?: string
  item_name?: string
  product_type?: string
  image_url?: string
  updated_at: string
}

export const catalogApi = {
  get: (asin: string) => request<CatalogItem>(`/catalog/${asin}`),

  refresh: (asin: string) =>
    request<CatalogItem>(`/catalog/${asin}/refresh`, {
      method: 'POST',
    }),
}

// Scraper API
export const scraperApi = {
  start: () =>
    request<{ success: boolean; message: string }>('/scraper/start', {
      method: 'POST',
    }),

  stop: () =>
    request<{ success: boolean }>('/scraper/stop', {
      method: 'POST',
    }),

  status: () =>
    request<{ running: boolean; progress?: number; current_asin?: string }>('/scraper/status'),
}

// Auth API
export interface User {
  id: number
  email: string
  name?: string
  role: string
}

export const authApi = {
  login: async (email: string, password: string) => {
    const result = await request<{ success: boolean; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    // Refresh CSRF token after successful login (new session established)
    if (result.success) {
      await refreshCsrfToken()
    }
    return result
  },

  logout: async () => {
    const result = await request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    })
    // Refresh CSRF token after logout (session invalidated)
    await refreshCsrfToken()
    return result
  },

  me: () => request<{ user: User }>('/auth/me'),

  register: async (email: string, password: string, name?: string) => {
    const result = await request<{ success: boolean; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    })
    // Refresh CSRF token after successful registration (new session established)
    if (result.success) {
      await refreshCsrfToken()
    }
    return result
  },
}

export { ApiError }
