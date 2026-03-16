import { googleApiFetch, googleApiJson } from '@dios/shared'
import { getSystemConfig, saveSystemConfig } from '../utils/systemConfig'
import { parseAddress } from '../utils/addressParser'

const INSPECTION_HEADERS = [
  'Status', 'Agency', 'Start Date', 'Operation Name', 'Scope', 'City', 'State', 'County',
  'Inspection Date', 'Inv. Created', 'Invoice No.', 'Amount', 'Expenses', 'Paid',
  'Miles', 'Drive Time', 'Addl. Hours', 'Notes', 'Month', 'Bundle', 'Expense Details',
  'Date Paid', 'Cal Event ID', 'Prep Time', 'Onsite Time', 'Report Time', 'Inspection ID',
]

const OPERATOR_HEADERS = [
  'Name', 'Agency', 'Type', 'Status', 'Address', 'City', 'State', 'County',
  'Contact Name', 'Phone', 'Email', 'Client ID', 'Distance (mi)', 'Drive Time (min)',
  'Notes', 'Operator ID',
]

const EXPENSE_HEADERS = [
  'Date', 'Vendor', 'Amount', 'Category', 'Notes', 'Inspection ID', 'Receipt', 'Expense ID',
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface DriveFileList {
  files: Array<{ id: string; name: string }>
}

interface SpreadsheetResponse {
  spreadsheetId: string
}

interface ValuesResponse {
  values?: string[][]
}

/**
 * Search Google Drive for an existing DIOS Studio master spreadsheet for the given year.
 */
export async function findMasterSheet(year: number): Promise<string | null> {
  const q = `name='DIOS Studio - ${year}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`

  const data = await googleApiJson<DriveFileList>(url)
  return data.files.length > 0 ? data.files[0].id : null
}

/**
 * Create a new master spreadsheet for the given year with the Inspections sheet
 * pre-configured with headers and a hidden Inspection ID column.
 */
export async function createMasterSheet(year: number): Promise<string> {
  const buildHeaderRow = (headers: string[]) => ({
    rowData: [{
      values: headers.map(h => ({
        userEnteredValue: { stringValue: h },
        userEnteredFormat: { textFormat: { bold: true } },
      })),
    }],
  })

  const body = {
    properties: { title: `DIOS Studio - ${year}` },
    sheets: [
      {
        properties: { sheetId: 0, title: 'Inspections', gridProperties: { frozenRowCount: 1 } },
        data: [buildHeaderRow(INSPECTION_HEADERS)],
      },
      {
        properties: { sheetId: 1, title: 'Operators', gridProperties: { frozenRowCount: 1 } },
        data: [buildHeaderRow(OPERATOR_HEADERS)],
      },
      {
        properties: { sheetId: 2, title: 'Expenses', gridProperties: { frozenRowCount: 1 } },
        data: [buildHeaderRow(EXPENSE_HEADERS)],
      },
    ],
  }

  const res = await googleApiFetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Failed to create spreadsheet: ${res.status} ${res.statusText}`)
  }

  const created: SpreadsheetResponse = await res.json()
  const spreadsheetId = created.spreadsheetId

  // Hide the ID columns on all three tabs
  const hideCol = (sheetId: number, colIndex: number) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'COLUMNS', startIndex: colIndex, endIndex: colIndex + 1 },
      properties: { hiddenByUser: true },
      fields: 'hiddenByUser',
    },
  })

  const protectSheet = (sheetId: number) => ({
    addProtectedRange: {
      protectedRange: {
        range: { sheetId },
        description: 'Synced by DIOS Studio. Duplicate this sheet to edit.',
        warningOnly: true,
      },
    },
  })

  const batchBody = {
    requests: [
      hideCol(0, 26),  // Inspections: Inspection ID (col AA)
      hideCol(1, 15),  // Operators: Operator ID (col P)
      hideCol(2, 7),   // Expenses: Expense ID (col H)
      protectSheet(0),  // Protect Inspections
      protectSheet(1),  // Protect Operators
      protectSheet(2),  // Protect Expenses
    ],
  }

  await googleApiFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchBody),
    },
  )

  return spreadsheetId
}

/**
 * Get or create the master spreadsheet for the given year.
 * Caches the spreadsheet ID in system config to avoid repeated lookups.
 */
export async function getOrCreateMasterSheet(year: number, userId: string): Promise<string> {
  const configKey = `sheetsSpreadsheetId_${year}`
  const config = await getSystemConfig(userId)
  const cachedId = config[configKey] as string | undefined

  if (cachedId) {
    try {
      await googleApiJson<SpreadsheetResponse>(
        `https://sheets.googleapis.com/v4/spreadsheets/${cachedId}?fields=spreadsheetId`,
      )
      return cachedId
    } catch {
      // Cached ID is invalid (404 or other error), clear it and proceed
      await saveSystemConfig(userId, { ...config, [configKey]: '' })
    }
  }

  let spreadsheetId = await findMasterSheet(year)

  if (!spreadsheetId) {
    spreadsheetId = await createMasterSheet(year)
  }

  await saveSystemConfig(userId, { ...config, [configKey]: spreadsheetId })
  return spreadsheetId
}

/**
 * Build a row array from inspection data matching the INSPECTION_HEADERS order.
 */
export function buildRowFromInspection(params: {
  inspection: any
  operation: any
  agency: any
  invoice: any | null
  expenses: any[]
}): string[] {
  const { inspection, operation, agency, invoice, expenses } = params
  const { city, state, county } = parseAddress(operation?.address || '')

  const totalExpenses = expenses.reduce((sum: number, e: any) => {
    const amt = typeof e.amount === 'number' ? e.amount : parseFloat(e.amount) || 0
    return sum + amt
  }, 0)

  const expenseDetails = expenses
    .map((e: any) => {
      const vendor = e.vendor || e.description || 'Unknown'
      const amt = typeof e.amount === 'number' ? e.amount : parseFloat(e.amount) || 0
      return `${vendor}: $${amt.toFixed(2)}`
    })
    .join('; ')

  let month = ''
  if (inspection.date) {
    const parsed = new Date(inspection.date)
    if (!isNaN(parsed.getTime())) {
      month = MONTH_NAMES[parsed.getMonth()]
    }
  }

  const miles = inspection.calculatedMileage != null
    ? String(inspection.calculatedMileage)
    : (inspection.milesDriven != null ? String(inspection.milesDriven) : '')

  return [
    inspection.status || '',
    agency?.name || '',
    inspection.date || '',
    operation?.name || '',
    operation?.operationType || '',
    city,
    state,
    county,
    inspection.date || '',
    invoice?.date || invoice?.createdAt || '',
    invoice?.invoiceNumber || '',
    invoice?.totalAmount != null ? String(invoice.totalAmount) : '',
    totalExpenses > 0 ? String(totalExpenses) : '',
    invoice?.status === 'Paid' ? 'Yes' : '',
    miles,
    inspection.calculatedDriveTime != null ? String(inspection.calculatedDriveTime) : '',
    inspection.additionalHoursLog != null ? String(inspection.additionalHoursLog) : '',
    inspection.notes || '',
    month,
    inspection.bundleId || '',
    expenseDetails,
    invoice?.paidDate || '',
    inspection.googleCalendarEventId || '',
    inspection.prepHours != null ? String(inspection.prepHours) : '',
    inspection.onsiteHours != null ? String(inspection.onsiteHours) : '',
    inspection.reportHours != null ? String(inspection.reportHours) : '',
    inspection.id,
  ]
}

/**
 * Find the row number for a given inspection ID in the hidden AA column.
 * Returns the 1-indexed row number or null if not found.
 */
export async function findRowByInspectionId(
  spreadsheetId: string,
  inspectionId: string,
): Promise<number | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Inspections!AA:AA`
  const data = await googleApiJson<ValuesResponse>(url)

  if (!data.values) return null

  for (let i = 1; i < data.values.length; i++) {
    if (data.values[i]?.[0] === inspectionId) {
      return i + 1 // 1-indexed, +1 because row 1 is the header
    }
  }

  return null
}

/**
 * Sync a single inspection row to the spreadsheet.
 * Updates the existing row if found, otherwise appends a new row.
 */
export async function syncInspectionRow(
  spreadsheetId: string,
  inspectionId: string,
  rowData: string[],
): Promise<void> {
  const rowNumber = await findRowByInspectionId(spreadsheetId, inspectionId)

  if (rowNumber) {
    const range = `Inspections!A${rowNumber}:AA${rowNumber}`
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`

    const res = await googleApiFetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowData] }),
    })

    if (!res.ok) {
      throw new Error(`Failed to update row ${rowNumber}: ${res.status} ${res.statusText}`)
    }
  } else {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Inspections!A:AA')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

    const res = await googleApiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [rowData] }),
    })

    if (!res.ok) {
      throw new Error(`Failed to append row: ${res.status} ${res.statusText}`)
    }
  }
}

/**
 * Perform a full sync: clear all data rows and write all rows at once.
 * Preserves the header row (row 1).
 */
export async function fullSync(
  spreadsheetId: string,
  allRows: string[][],
): Promise<void> {
  const range = encodeURIComponent('Inspections!A2:AA')

  // Clear existing data rows using the clear endpoint
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`
  const clearRes = await googleApiFetch(clearUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  if (!clearRes.ok) {
    throw new Error(`Failed to clear sheet: ${clearRes.status} ${clearRes.statusText}`)
  }

  if (allRows.length === 0) return

  // Write all rows
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`
  const writeRes = await googleApiFetch(writeUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: allRows }),
  })

  if (!writeRes.ok) {
    throw new Error(`Failed to write rows: ${writeRes.status} ${writeRes.statusText}`)
  }
}

// ── Operators Tab ──────────────────────────────────────────────────────

export function buildRowFromOperation(params: {
  operation: any
  agency: any
}): string[] {
  const { operation, agency } = params
  const { city, state, county } = parseAddress(operation?.address || '')

  return [
    operation.name || '',
    agency?.name || '',
    operation.operationType || '',
    operation.status || '',
    operation.address || '',
    city,
    state,
    county,
    operation.contactName || '',
    operation.phone || '',
    operation.email || '',
    operation.clientId || '',
    operation.cachedDistanceMiles != null ? String(operation.cachedDistanceMiles) : '',
    operation.cachedDriveTimeMinutes != null ? String(operation.cachedDriveTimeMinutes) : '',
    operation.notes || operation.quickNote || '',
    operation.id,
  ]
}

export async function fullSyncOperators(
  spreadsheetId: string,
  allRows: string[][],
): Promise<void> {
  const lastCol = String.fromCharCode(64 + OPERATOR_HEADERS.length) // 'P'
  const range = encodeURIComponent(`Operators!A2:${lastCol}`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`

  const clearRes = await googleApiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[]] }),
  })

  if (!clearRes.ok) {
    throw new Error(`Failed to clear Operators sheet: ${clearRes.status}`)
  }

  if (allRows.length === 0) return

  const writeRes = await googleApiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: allRows }),
  })

  if (!writeRes.ok) {
    throw new Error(`Failed to write Operators rows: ${writeRes.status}`)
  }
}

// ── Expenses Tab ───────────────────────────────────────────────────────

export function buildRowFromExpense(expense: any): string[] {
  return [
    expense.date || '',
    expense.vendor || '',
    expense.amount != null ? String(expense.amount) : '',
    expense.category || '',
    expense.notes || '',
    expense.inspectionId || '',
    expense.receiptImageUrl ? 'Yes' : '',
    expense.id,
  ]
}

export async function fullSyncExpenses(
  spreadsheetId: string,
  allRows: string[][],
): Promise<void> {
  const lastCol = String.fromCharCode(64 + EXPENSE_HEADERS.length) // 'H'
  const range = encodeURIComponent(`Expenses!A2:${lastCol}`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`

  const clearRes = await googleApiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [[]] }),
  })

  if (!clearRes.ok) {
    throw new Error(`Failed to clear Expenses sheet: ${clearRes.status}`)
  }

  if (allRows.length === 0) return

  const writeRes = await googleApiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: allRows }),
  })

  if (!writeRes.ok) {
    throw new Error(`Failed to write Expenses rows: ${writeRes.status}`)
  }
}
