/**
 * sid provided by login provider (Google)
 */
export type userId = string

export type jobId = Crypto['randomUUID']

export type prestationId = Crypto['randomUUID']

export type invoiceId = Crypto['randomUUID']

export type Prestation = {
  description?: string
  checkin: EpochTimeStamp
  serverCheckin: EpochTimeStamp
  checkout?: EpochTimeStamp
  serverCheckout?: EpochTimeStamp
  // duration in milliseconds (computed on checkout)
  duration?: number
  jobId?: jobId
}

export type Place = {
  id: string // google place id
  displayName: string
  formattedAddress: string
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
}

export interface User extends BaseInput {
  email: string
  picture: string
  place: Place
  phone: string
  roles?: string[]
  currentJob?: jobId
  invited?: boolean
}
export interface Invoice extends BaseInput {
  invoiceImages: string[]
  company: string
  job: string
  user: string
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
export type Invites = {
  [uuid: string]: {
    email: string
    roles: string[]
    createdAt: number
    invited: boolean
  }
}
