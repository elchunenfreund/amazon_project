const API_BASE = '/api'

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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(response.status, response.statusText, text || response.statusText)
  }

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    return response.json()
  }
  return response.text() as unknown as T
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return handleResponse<T>(response)
}

// Products API
export interface Product {
  id: number
  asin: string
  comment?: string
  snoozed?: boolean
  snooze_until?: string
  created_at: string
  updated_at: string
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
}

export const productsApi = {
  getAll: () => request<Product[]>('/products'),

  get: (id: number) => request<Product>(`/products/${id}`),

  create: (data: { asin: string; comment?: string }) =>
    request<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Product>) =>
    request<Product>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    request<void>(`/products/${id}`, {
      method: 'DELETE',
    }),

  bulkDelete: (ids: number[]) =>
    request<void>('/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
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

export const asinsApi = {
  getLatest: () => request<AsinReport[]>('/asins/latest'),

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
  shipped_cogs?: number
  shipped_units?: number
  ordered_units?: number
  ordered_revenue?: number
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
}

export const vendorReportsApi = {
  getAll: (filters?: VendorReportFilters) => {
    const params = new URLSearchParams()
    if (filters?.startDate) params.set('startDate', filters.startDate)
    if (filters?.endDate) params.set('endDate', filters.endDate)
    if (filters?.asin) params.set('asin', filters.asin)
    if (filters?.reportType) params.set('reportType', filters.reportType)
    const query = params.toString()
    return request<VendorReport[]>(`/vendor-reports${query ? `?${query}` : ''}`)
  },

  sync: () =>
    request<{ success: boolean; message: string }>('/sp-api/sync-reports', {
      method: 'POST',
    }),

  getAsins: () => request<string[]>('/vendor-reports/asins'),
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
  login: (email: string, password: string) =>
    request<{ success: boolean; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    }),

  me: () => request<{ user: User }>('/auth/me'),

  register: (email: string, password: string, name?: string) =>
    request<{ success: boolean; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),
}

export { ApiError }
