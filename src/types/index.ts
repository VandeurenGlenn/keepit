/**
 * sid provided by login provider (Google)
 */
export type userId = string

export type jobId = string

export type prestationId = string

export type invoiceId = string

export type quoteId = string

export type WorkLocation = {
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  capturedAt: EpochTimeStamp
}

export type TimelinePlace = {
  id?: string
  name: string
  formattedAddress?: string
  primaryType?: string
}

export type TimelinePlaceCacheEntry = {
  location: WorkLocation
  placeId?: string
  place?: TimelinePlace
  resolvedAt?: EpochTimeStamp
  lastUsedAt: EpochTimeStamp
}

export type TimelinePlaceCache = {
  [uuid: string]: TimelinePlaceCacheEntry
}

export type TimelineLocationEvent = {
  id: string
  type: 'departure' | 'arrival' | 'return'
  occurredAt: EpochTimeStamp
  location: WorkLocation
  jobId?: jobId
  place?: TimelinePlace
}

export type Prestation = {
  description?: string
  checkin: EpochTimeStamp
  serverCheckin: EpochTimeStamp
  checkout?: EpochTimeStamp
  serverCheckout?: EpochTimeStamp
  // duration in milliseconds (computed on checkout)
  duration?: number
  jobId?: jobId
  checkinLocation?: WorkLocation
  checkoutLocation?: WorkLocation
  checkinPlace?: TimelinePlace
  checkoutPlace?: TimelinePlace
  checkinLocationVerification?: LocationVerification
  checkoutLocationVerification?: LocationVerification
  invoicedAt?: EpochTimeStamp
  invoiceId?: invoiceId
}

export interface InvoiceHourLine {
  userId: userId
  prestationIds: prestationId[]
  totalDuration: number
}

export type Place = {
  id: string // google place id
  displayName: string
  formattedAddress: string
  location?: {
    latitude: number
    longitude: number
  }
}

export type LocationVerification = {
  status: 'on-site' | 'off-site' | 'unavailable'
  distanceMeters?: number
  thresholdMeters: number
}

export interface BaseInput {
  name: string
  createdAt: string
  updatedAt: string
  description?: string
}

export interface Job extends BaseInput {
  place: Place
  images?: string[]
  hours?: {
    [userId: string]: string[]
  }
  materials?: MaterialLine[]
  // Optional notes attached to the job
  notes?: {
    id: string
    text: string
    createdAt: string
    author?: string
  }[]
  status?: 'active' | 'completed'
}

export interface Company extends BaseInput {
  logo: string
  place: Place
  relationshipType?: 'customer' | 'supplier'
}

export interface User extends BaseInput {
  email: string
  googleEmail?: string
  picture: string
  place: Place
  phone: string
  roles?: string[]
  currentJob?: jobId
  preferences?: {
    continuousTimelineLocation?: boolean
  }
  invited?: boolean
}

export type PlanningEntry = {
  id: string
  jobId: jobId
  userIds: userId[]
  start: string
  end: string
  notes?: string
  createdAt: string
  updatedAt: string
  createdBy: userId
}

export type PlanningEntries = {
  [planningId: string]: PlanningEntry
}

export type AppNotification = {
  id: string
  userId: userId
  type: 'planning-created' | 'planning-updated' | 'planning-cancelled'
  title: string
  message: string
  url: string
  createdAt: string
  readAt?: string
}

export type AppNotifications = {
  [userId: userId]: AppNotification[]
}

export interface Invoice extends BaseInput {
  invoiceImages: string[]
  company: string
  job: string
  user: string
  notes?: string
  year?: number
  materials?: MaterialLine[]
  hours?: InvoiceHourLine[]
}

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected'

export interface Quote extends BaseInput {
  id: quoteId
  jobId: jobId
  status: QuoteStatus
  materials: MaterialLine[]
  notes?: string
  validUntil?: string
  createdBy: userId
}

export interface MaterialLine {
  name: string
  quantity: number
  unit?: string
  unitPrice?: number
  kind?: 'material' | 'small-materials'
  smallMaterialAmount?: number
  articleNumber?: string
  productNumber?: string
  packagingQuantity?: number
  description?: string
  image?: string
  technicalData?: Record<string, string>
  manufacturerData?: Record<string, string>
  dataSources?: ProductDataSource[]
  imageCandidates?: ProductImageCandidate[]
}

export interface ProductDataSource {
  provider: string
  pageUrl: string
  productNumber: string
  fetchedAt: string
}

export interface ProductImageCandidate {
  url: string
  sourceUrl: string
  provider: string
  rightsStatus: 'licensed' | 'permission-required' | 'unknown'
  licenseUrl?: string
  checkedAt: string
}

export interface MediaAsset {
  id: string
  filename: string
  originalName: string
  year: number
  url: string
  mimeType: string
  size: number
  collection: string
  folder?: string
  slot?: string
  group?: string
  order?: number
  alt?: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type orderId = string

export interface ShopProduct {
  id: string // Generated from material name + source
  name: string
  price: number
  quantity?: number
  unit?: string
  source: 'desco' | 'alelek' // Which catalog it comes from
  articleNumber?: string
  productNumber?: string
  packagingQuantity?: number
  description?: string
  image?: string
  technicalData?: Record<string, string>
  manufacturerData?: Record<string, string>
  dataSources?: ProductDataSource[]
  imageCandidates?: ProductImageCandidate[]
  sku?: string
}

export interface ShopOrderItem {
  productId: string
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface ShopOrder extends BaseInput {
  id: string
  userId: userId
  items: ShopOrderItem[]
  total: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  shippingAddress?: string
  notes?: string
}

export type ShopOrders = {
  [orderId: string]: ShopOrder
}

export type BannedUser = {
  id: userId
  reason: string
  createdAt: string
}

export type Jobs = {
  [uuid: string]: Job
}

export type Companies = {
  [uuid: string]: Company
}

export type Users = {
  [userId: userId]: User
}

export type Invoices = {
  [invoiceId: string]: Invoice
}

export type Quotes = {
  [quoteId: string]: Quote
}

export type MediaAssets = {
  [mediaId: string]: MediaAsset
}

export type BannedUsers = {
  [uuid: userId]: BannedUser
}

export type Hours = {
  [uuid: userId]: {
    [uuid: string]: Prestation
  }
}

export type TimelineLocationEvents = {
  [uuid: userId]: TimelineLocationEvent[]
}

export type TimelineTrackingStates = {
  [uuid: userId]: {
    lastPosition?: WorkLocation
    lastPlaceLocation?: WorkLocation
    anchor?: {
      location: WorkLocation
      arrivedAt: EpochTimeStamp
      jobId?: jobId
      place?: TimelinePlace
    }
    candidate?: {
      location: WorkLocation
      startedAt: EpochTimeStamp
    }
    outsideSamples?: number
    departedJobId?: jobId
    activeJobId?: jobId
    activeJobStartedAt?: EpochTimeStamp
    activeJobLocation?: WorkLocation
  }
}
export type Invites = {
  [uuid: string]: {
    email: string
    roles: string[]
    createdAt: number
    invited: boolean
  }
}
