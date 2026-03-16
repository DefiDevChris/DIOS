export const FIRESTORE_COLLECTIONS = {
  AGENCIES: 'agencies',
  OPERATIONS: 'operations',
  INSPECTIONS: 'inspections',
  INVOICES: 'invoices',
  EXPENSES: 'expenses',
  TASKS: 'tasks',
  NOTES: 'notes',
  UNASSIGNED_UPLOADS: 'unassigned_uploads',
  SYSTEM_SETTINGS: 'system_settings',
  DOCUMENTS: 'documents',
  ACTIVITIES: 'activities',
} as const

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
] as const

export const DEFAULT_OAUTH_CLIENT_ID = ''

export const APP_NAME = 'DIOS Studio'
export const CONFIG_KEY = 'dios_studio_config'
export const TOKEN_KEY = 'googleAccessToken'
export const TOKEN_EXPIRY_KEY = 'googleAccessTokenExpiry'
