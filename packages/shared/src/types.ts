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
  flatRateBaseAmount: number
  flatRateIncludedHours: number
  additionalHourlyRate: number
  mileageRate: number
  travelTimeHourlyRate?: number
  perDiemRate?: number
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
  inspectionStatus?: 'prep' | 'scheduled' | 'inspected' | 'report' | 'invoiced' | 'paid'
  lat?: number
  lng?: number
}

export interface Inspection {
  id: string
  operationId: string
  date: string
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'
  baseHoursLog: number
  additionalHoursLog: number
  milesDriven: number
  bundleId?: string
  notes?: string
  isBundled?: boolean
  totalTripDriveTime?: number
  totalTripStops?: number
  sharedDriveTime?: number
  mealsAndExpenses?: number
  perDiemDays?: number
  customLineItemName?: string
  customLineItemAmount?: number
  invoiceNotes?: string
  invoiceExceptions?: string
  reportCompleted?: boolean
  googleCalendarEventId?: string
}

export interface Invoice {
  id: string
  inspectionId: string
  agencyId: string
  totalAmount: number
  pdfDriveId: string
  status: 'Paid' | 'Unpaid'
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

export interface InvoiceData {
  invoiceNumber: string
  date: string
  billTo: { name: string; address: string }
  serviceFor: { name: string; address: string }
  baseRate: number
  baseHours: number
  additionalHours: number
  additionalRate: number
  driveTime: number
  driveTimeRate: number
  milesDriven: number
  mileageRate: number
  perDiemDays: number
  perDiemRate: number
  mealsAndExpenses: number
  customLineItemName?: string
  customLineItemAmount?: number
  notes?: string
  exceptions?: string
  totalAmount: number
}

export interface TaxReportData {
  year: number
  totalIncome: number
  expenses: Record<string, number>
  mileage: { totalMiles: number; rate: number; deduction: number }
}
