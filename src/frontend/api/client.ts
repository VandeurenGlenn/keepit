import {
  Job,
  JobCompletionCheck,
  Invoice,
  User,
  Company,
  Prestation,
  WorkLocation,
  WorkReport,
  TimelineLocationEvent,
  MaterialLine,
  ShopProduct,
  ShopOrder,
  ShopOrderItem,
  Jobs,
  PlanningEntry,
  AppNotification,
  Quote,
  Quotes,
  BackupSummary,
  KeepitBackup,
  jobId,
  userId,
  invoiceId
} from '../../types/index.js'

interface ApiResponse<T> {
  ok: boolean
  status: number
  data?: T
  error?: string
}

class ApiClient {
  private baseUrl = '/api'

  private getAuthToken(): string | null {
    try {
      return globalThis.localStorage?.getItem('token') ?? null
    } catch {
      return null
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const token = this.getAuthToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (token) {
      headers.Authorization = token
    }

    const options: RequestInit = {
      method,
      headers
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText)
      throw new Error(`API error ${response.status}: ${error}`)
    }

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>
    }

    return response.text() as Promise<T>
  }

  // Hours API
  async checkIn(
    job: jobId,
    checkin: number,
    location?: WorkLocation,
    options: { source?: Prestation['source']; clientRequestId?: string } = {}
  ): Promise<Prestation & { id: string }> {
    return this.request('POST', '/hours/checkin', { job, checkin, location, ...options })
  }

  async checkOut(
    job: jobId,
    checkout: number,
    location?: WorkLocation,
    options: { prestationId?: string; clientRequestId?: string } = {}
  ): Promise<Prestation & { id: string }> {
    return this.request('POST', '/hours/checkout', { job, checkout, location, ...options })
  }

  async correctHours(jobId: string, userId: string, prestationId: string, input: { checkin: number; checkout?: number; reason: string }): Promise<Prestation> {
    return this.request('PATCH', `/hours/job/${jobId}/${userId}/${prestationId}`, input)
  }

  async getMyTimeline(days = 14): Promise<Array<Prestation & { id: string }>> {
    return this.request('GET', `/hours/me?days=${days}`)
  }

  async getHoursReport(from:string,to:string):Promise<WorkReport>{const params=new URLSearchParams({from,to});return this.request('GET',`/reports/hours?${params}`)}

  async getJobHours(jobId: jobId, billableOnly = false): Promise<Record<string, Prestation[]>> {
    const query = billableOnly ? '?billableOnly=true' : ''
    return this.request('GET', `/hours/job/${jobId}${query}`)
  }

  // Jobs API
  async getJobs(): Promise<Jobs> {
    return this.request('GET', '/jobs')
  }

  async createJob(job: {
    name: string
    description?: string
    place: any
    uuid?: string
  }): Promise<{ uuid: string; content: Job }> {
    return this.request('POST', '/jobs', job)
  }

  async getJob(jobId: jobId): Promise<Job> {
    return this.request('GET', `/job/${jobId}`)
  }

  async getJobCompletionCheck(jobId: jobId): Promise<JobCompletionCheck> {
    return this.request('GET', `/job/${jobId}/completion-check`)
  }

  async updateJob(jobId: jobId, updates: Partial<Job>): Promise<Job> {
    return this.request('PATCH', `/job/${jobId}`, updates)
  }

  async deleteJob(jobId: jobId): Promise<void> {
    return this.request('DELETE', `/jobs/${jobId}`)
  }

  // Planning API
  async getPlanning(from: string, to: string): Promise<PlanningEntry[]> {
    const params = new URLSearchParams({ from, to })
    return this.request('GET', `/planning?${params.toString()}`)
  }

  async createPlanning(input: Pick<PlanningEntry, 'jobId' | 'userIds' | 'start' | 'end' | 'notes'>) {
    return this.request<PlanningEntry>('POST', '/planning', input)
  }

  async updatePlanning(
    id: string,
    updates: Partial<Pick<PlanningEntry, 'jobId' | 'userIds' | 'start' | 'end' | 'notes'>>
  ) {
    return this.request<PlanningEntry>('PATCH', `/planning/${id}`, updates)
  }

  async deletePlanning(id: string): Promise<void> {
    return this.request('DELETE', `/planning/${id}`)
  }

  async getNotifications(unreadOnly = false): Promise<AppNotification[]> {
    return this.request('GET', `/notifications${unreadOnly ? '?unread=true' : ''}`)
  }

  async markNotificationRead(id: string): Promise<void> {
    return this.request('PATCH', `/notifications/${id}/read`)
  }

  // Quotes API
  async getQuotes(): Promise<Quotes> {
    return this.request('GET', '/quotes')
  }

  async getQuote(id: string): Promise<Quote> {
    return this.request('GET', `/quotes/${id}`)
  }

  async createQuote(input: Pick<Quote, 'name' | 'jobId' | 'status' | 'materials'> & Partial<Quote>): Promise<Quote> {
    return this.request('POST', '/quotes', input)
  }

  async updateQuote(id: string, updates: Partial<Quote>): Promise<Quote> {
    return this.request('PATCH', `/quotes/${id}`, updates)
  }

  async duplicateQuote(id: string): Promise<Quote> {
    return this.request('POST', `/quotes/${id}/duplicate`)
  }

  async deleteQuote(id: string): Promise<void> {
    return this.request('DELETE', `/quotes/${id}`)
  }

  // Invoices API
  async getInvoices(): Promise<Invoice[]> {
    return this.request('GET', '/invoices')
  }

  async createInvoice(
    invoice: Partial<Invoice> & { company: string; job: string; user: string }
  ): Promise<{ uuid: string; content: Invoice }> {
    return this.request('POST', '/invoices', invoice)
  }

  async getInvoice(invoiceId: invoiceId): Promise<Invoice> {
    return this.request('GET', `/invoice/${invoiceId}`)
  }

  async updateInvoice(invoiceId: invoiceId, updates: Partial<Invoice>): Promise<Invoice> {
    return this.request('PATCH', `/invoice/${invoiceId}`, updates)
  }

  async deleteInvoice(invoiceId: invoiceId): Promise<void> {
    return this.request('DELETE', `/invoices/${invoiceId}`)
  }

  async getInvoiceMaterials(company?: string): Promise<MaterialLine[]> {
    const params = new URLSearchParams()
    params.set('includePrices', 'true')
    if (company) params.set('company', company)
    return this.request('GET', `/invoices/materials?${params.toString()}`)
  }

  async uploadInvoiceFile(formData: FormData): Promise<string[]> {
    const url = `${this.baseUrl}/invoices/upload`
    const token = this.getAuthToken()
    const headers: Record<string, string> = {}

    if (token) {
      headers.Authorization = token
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed ${response.status}: ${response.statusText}`)
    }

    return response.json() as Promise<string[]>
  }

  // Users API
  async getUser(userId: userId): Promise<User> {
    return this.request('GET', `/users/${userId}`)
  }

  async updateContinuousTimelinePreference(enabled: boolean): Promise<{ continuousTimelineLocation: boolean }> {
    return this.request('PATCH', '/users/me/preferences', { continuousTimelineLocation: enabled })
  }

  async updateUserPreferences(preferences: NonNullable<User['preferences']>): Promise<NonNullable<User['preferences']>> {
    return this.request('PATCH', '/users/me/preferences', preferences)
  }

  async submitTimelinePosition(location: WorkLocation): Promise<{
    accepted: boolean
    events?: TimelineLocationEvent[]
    shouldNotifyCheckout?: boolean
    currentJob?: { id: string; name: string }
    shouldSuggestCheckin?: boolean
    suggestedJob?: { id: string; name: string }
    movementNotifications?: Array<{
      kind: 'home-departure' | 'large-trip'
      title: string
      message: string
      tag: string
      url?: string
    }>
  }> {
    return this.request('POST', '/timeline/position', { location })
  }

  async getMyLocationTimeline(days = 30): Promise<TimelineLocationEvent[]> {
    return this.request('GET', `/timeline/me?days=${days}`)
  }

  async clearMyLocationTimeline(): Promise<void> {
    return this.request('DELETE', '/timeline/me')
  }

  async getHandshake(): Promise<string> {
    return this.request('GET', '/handshake')
  }

  async registerUser(user: Partial<User> & { inviteId?: string }): Promise<User> {
    return this.request('POST', '/register', user)
  }

  // Companies API
  async getCompanies(): Promise<Record<string, Company>> {
    return this.request('GET', '/companies')
  }

  async createCompany(company: Partial<Company>): Promise<{ uuid: string; content: Company }> {
    return this.request('POST', '/companies', company)
  }

  async getCompany(uuid: string): Promise<Company> {
    return this.request('GET', `/companies/${uuid}`)
  }

  async updateCompany(uuid: string, updates: Partial<Company>): Promise<Company> {
    return this.request('PATCH', `/companies/${uuid}`, updates)
  }

  async deleteCompany(uuid: string): Promise<void> {
    return this.request('DELETE', `/companies/${uuid}`)
  }

  // Shop API
  async getShopProducts(
    search?: string,
    options?: {
      limit?: number
      offset?: number
      popular?: boolean
      source?: string
      category?: string
      price?: string
      favoritesOnly?: boolean
    }
  ): Promise<{ total: number; products: ShopProduct[] }> {
    const params = new URLSearchParams()

    if (search) params.set('search', search)
    if (options?.limit !== undefined) params.set('limit', String(options.limit))
    if (options?.offset !== undefined) params.set('offset', String(options.offset))
    if (options?.popular) params.set('popular', 'true')
    if (options?.source && options.source !== 'all') params.set('source', options.source)
    if (options?.category && options.category !== 'all') params.set('category', options.category)
    if (options?.price && options.price !== 'all') params.set('price', options.price)
    if (options?.favoritesOnly) params.set('favoritesOnly', 'true')

    const query = params.size > 0 ? `?${params.toString()}` : ''
    return this.request('GET', `/shop/products${query}`)
  }

  async importShopCart(
    source: 'desco' | 'alelek',
    text: string
  ): Promise<{ materials: MaterialLine[]; unmatched: string[] }> {
    return this.request('POST', '/shop/cart-import', { source, text })
  }

  async getShopAutocomplete(query: string): Promise<{ suggestions: string[] }> {
    if (!query || query.length < 1) {
      return { suggestions: [] }
    }
    return this.request('GET', `/shop/autocomplete?q=${encodeURIComponent(query)}`)
  }

  async getShopOrders(): Promise<{ total: number; orders: ShopOrder[] }> {
    return this.request('GET', '/shop/orders')
  }

  async getShopOrder(orderId: string): Promise<ShopOrder> {
    return this.request('GET', `/shop/orders/${orderId}`)
  }

  async createShopOrder(input: {
    items: Array<Pick<ShopOrderItem, 'productId' | 'quantity'>>
    shippingAddress?: string
    notes?: string
  }): Promise<{ ok: boolean; orderId: string; order: ShopOrder }> {
    return this.request('POST', '/shop/orders', input)
  }

  async updateShopOrder(orderId: string, status: ShopOrder['status']): Promise<ShopOrder> {
    return this.request('PATCH', `/shop/orders/${orderId}`, { status })
  }

  // Material preferences
  async getFavorites(): Promise<Array<{ name: string; articleNumber?: string; unit?: string; unitPrice?: number }>> {
    return this.request('GET', '/invoices/preferences/favorites')
  }

  async addToFavorites(material: MaterialLine): Promise<void> {
    return this.request('POST', '/invoices/preferences/favorites', material)
  }

  async removeFromFavorites(name: string): Promise<void> {
    return this.request('DELETE', `/invoices/preferences/favorites/${encodeURIComponent(name)}`)
  }

  async isFavorite(name: string): Promise<boolean> {
    const result = await this.request<{ isFavorite: boolean }>(
      'GET',
      `/invoices/preferences/favorites/check/${encodeURIComponent(name)}`
    )
    return result.isFavorite
  }

  async getHistory(): Promise<
    Array<{ name: string; articleNumber?: string; unit?: string; unitPrice?: number; timestamp?: number }>
  > {
    return this.request('GET', '/invoices/preferences/history')
  }

  async addToHistory(material: MaterialLine): Promise<void> {
    return this.request('POST', '/invoices/preferences/history', material)
  }

  // Backups API (admin only)
  async getBackups(): Promise<{ backups: BackupSummary[]; automaticRetention: number }> {
    return this.request('GET', '/backups')
  }

  async createBackup(): Promise<BackupSummary> {
    return this.request('POST', '/backups')
  }

  async restoreBackup(backup: KeepitBackup, confirmation: string): Promise<{ ok: boolean; restoredAt: string }> {
    return this.request('POST', '/backups/restore', { backup, confirmation })
  }

  async downloadBackup(id: string): Promise<Blob> {
    const token = this.getAuthToken()
    const response = await fetch(`${this.baseUrl}/backups/${encodeURIComponent(id)}`, {
      headers: token ? { Authorization: token } : undefined
    })
    if (!response.ok) throw new Error(`Download mislukt (${response.status})`)
    return response.blob()
  }

  async globalSearch(query: string): Promise<{ results: Array<{ id: string; type: string; title: string; subtitle?: string; href: string; icon: string }> }> {
    return this.request('GET', `/search?q=${encodeURIComponent(query)}`)
  }

  async getControlCenter(): Promise<{ summary: { activeJobs: number; todayPlanning: number; draftQuotes: number; invoices: number }; alerts: Array<{ id: string; kind: string; title: string; detail: string; href: string; severity: 'warning'|'critical' }> }> {
    return this.request('GET','/control')
  }
}

export const api = new ApiClient()
