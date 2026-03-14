export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export interface AppConfig {
  firebaseConfig: FirebaseConfig
  googleMapsApiKey: string
  googleOAuthClientId?: string
}

export interface Agency {
  id: string
  name: string
  billingAddress: string
  isFlatRate: boolean
  flatRateAmount: number
  flatRateIncludedHours: number
  flatRateOverageRate: number
  hourlyRate: number
  driveTimeHourlyRate: number
  mileageReimbursed: boolean
  mileageRate: number
  perDiemRate: number
  perTypeRatesEnabled: boolean
  ratesByType: string
  operationTypes: string
  billingEmail: string
  billingContactName: string
  emailTemplateSubject: string
  emailTemplateBody: string
  prepChecklistEnabled: boolean
  prepChecklistItems: string
  reportChecklistEnabled: boolean
  reportChecklistItems: string
  defaultLineItems: string
  driveFolderId?: string
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}

export interface Operation {
  id: string
  name: string
  agencyId: string
  address: string
  contactName: string
  phone: string
  email: string
  status: 'active' | 'inactive'
  notes?: string
  quickNote?: string
  operationType: string
  clientId: string
  lat?: number
  lng?: number
  cachedDistanceMiles?: number
  cachedDriveTimeMinutes?: number
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}

export interface Inspection {
  id: string
  operationId: string
  date: string
  endDate?: string
  status: 'Scheduled' | 'Prep' | 'Inspected' | 'Report' | 'Invoiced' | 'Paid' | 'Cancelled'
  prepHours: number
  onsiteHours: number
  reportHours: number
  baseHoursLog: number
  additionalHoursLog: number
  milesDriven: number
  calculatedMileage: number
  calculatedDriveTime: number
  bundleId?: string
  isBundled?: boolean
  totalTripDriveTime?: number
  totalTripStops?: number
  sharedDriveTime?: number
  mealsAndExpenses?: number
  perDiemDays?: number
  customLineItemName?: string
  customLineItemAmount?: number
  linkedExpenses?: string[] | string
  lineItems?: string
  notes?: string
  invoiceNotes?: string
  invoiceExceptions?: string
  prepChecklistData: string
  reportChecklistData: string
  reportCompleted?: boolean
  googleCalendarEventId?: string
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}

export interface Invoice {
  id: string
  invoiceNumber?: string
  inspectionId: string
  operationId: string
  operationName: string
  agencyId: string
  agencyName: string
  totalAmount: number
  pdfDriveId?: string
  status: 'Not Complete' | 'Sent' | 'Paid'
  date: string
  inspectionDate: string
  sentDate?: string
  paidDate?: string
  lineItems?: string
  createdAt?: any
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}

export interface Expense {
  id: string
  date: string
  vendor: string
  amount: number
  notes?: string
  receiptImageUrl?: string
  receiptFileId?: string
  inspectionId?: string
  category?: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'completed'
  createdAt: string
  dueDate?: string
  operationId?: string
  inspectionId?: string
}

export interface OperationDocument {
  name: string
  size: number
  type: string
  uploadedAt: string
  url: string
}

export interface OperationActivity {
  type: string
  description: string
  timestamp: string
}

export interface UnassignedUpload {
  id: string
  fileName: string
  fileType: string
  fileUrl: string
  uploadedAt: string
  source: 'mobile' | 'desktop'
  operationId?: string
}

export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface SyncRecord {
  collection: string
  docId: string
  status: SyncStatus
  updatedAt: string
  lastSyncedAt?: string
  lastError?: string
}

export interface ChecklistItem {
  item: string
  checked: boolean
}

export interface RateConfig {
  isFlatRate: boolean
  flatRateAmount: number
  flatRateIncludedHours: number
  flatRateOverageRate: number
  hourlyRate: number
  driveTimeHourlyRate: number
  mileageReimbursed: boolean
  mileageRate: number
  perDiemRate: number
}

export interface DefaultLineItem {
  name: string
  amount: number
}

export interface InvoiceLineItem {
  name: string
  amount: number
  details?: string
}

export interface Note {
  id: string
  content: string
  operationId?: string
  createdAt: string
  updatedAt: string
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  ownerName: string
  agencyName: string
  agencyAddress: string
  operationName: string
  operationAddress: string
  lineItems: InvoiceLineItem[]
  totalAmount: number
  notes?: string
}

export interface TaxReportData {
  year: number
  totalIncome: number
  expenses: Record<string, number>
  mileage: { totalMiles: number; rate: number; deduction: number }
  totalMiles: number
  irsMileageRate: number
  mileageDeduction: number
}
