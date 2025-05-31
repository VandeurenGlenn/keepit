export type Prestation = {
  description?: string
  checkin: EpochTimeStamp
  serverCheckin: EpochTimeStamp
  checkout: EpochTimeStamp
  serverCheckout: EpochTimeStamp
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
  hours?: { [date: string]: { [employeeId: string]: Prestation } }
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
}

export interface Invoice extends BaseInput {
  invoiceImages: string[]
  company: string
  job: string
  user: string
}

export type BannedUser = {
  id: string
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
  [uuid: string]: User
}

export type Invoices = {
  [uuid: string]: Invoice
}

export type BannedUsers = {
  [uuid: string]: BannedUser
}
