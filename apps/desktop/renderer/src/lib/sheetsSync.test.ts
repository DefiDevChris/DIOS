import { describe, beforeEach, it, expect, vi } from 'vitest'
import {
  findMasterSheet,
  createMasterSheet,
  getOrCreateMasterSheet,
  buildRowFromInspection,
  buildRowFromOperation,
  buildRowFromExpense,
  findRowByInspectionId,
  syncInspectionRow,
  fullSync,
  fullSyncOperators,
  fullSyncExpenses,
} from './sheetsSync'

// Mock dependencies
const mockGoogleApiJson = vi.fn()
const mockGoogleApiFetch = vi.fn()
const mockGetSystemConfig = vi.fn()
const mockSaveSystemConfig = vi.fn()

vi.mock('@dios/shared', () => ({
  googleApiFetch: (...args: unknown[]) => mockGoogleApiFetch(...args),
  googleApiJson: (...args: unknown[]) => mockGoogleApiJson(...args),
}))

vi.mock('../utils/systemConfig', () => ({
  getSystemConfig: (...args: unknown[]) => mockGetSystemConfig(...args),
  saveSystemConfig: (...args: unknown[]) => mockSaveSystemConfig(...args),
}))

vi.mock('../utils/addressParser', () => ({
  parseAddress: vi.fn((address: string) => {
    if (!address) return { city: '', state: '', county: '' }
    // Simple mock implementation
    const parts = address.split(',').map(s => s.trim())
    return {
      city: parts.length >= 3 ? parts[parts.length - 3] : '',
      state: parts.length >= 2 ? parts[parts.length - 2] : '',
      county: '',
    }
  }),
}))

describe('sheetsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSystemConfig.mockResolvedValue({})
    mockSaveSystemConfig.mockResolvedValue(undefined)
  })

  describe('findMasterSheet', () => {
    it('returns spreadsheet ID when sheet exists', async () => {
      mockGoogleApiJson.mockResolvedValue({
        files: [{ id: 'spreadsheet-123', name: 'DIOS Studio - 2026' }],
      })

      const result = await findMasterSheet(2026)

      expect(result).toBe('spreadsheet-123')
      expect(mockGoogleApiJson).toHaveBeenCalledWith(
        expect.stringContaining('DIOS%20Studio%20-%202026')
      )
    })

    it('returns null when no sheet exists', async () => {
      mockGoogleApiJson.mockResolvedValue({ files: [] })

      const result = await findMasterSheet(2026)

      expect(result).toBeNull()
    })

    it('constructs correct search query with encoded URL', async () => {
      mockGoogleApiJson.mockResolvedValue({ files: [] })

      await findMasterSheet(2025)

      expect(mockGoogleApiJson).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent("name='DIOS Studio - 2025'"))
      )
    })
  })

  describe('createMasterSheet', () => {
    it('creates spreadsheet with three tabs', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ spreadsheetId: 'new-sheet-id' }),
      })

      const result = await createMasterSheet(2026)

      expect(result).toBe('new-sheet-id')
      expect(mockGoogleApiFetch).toHaveBeenCalledWith(
        'https://sheets.googleapis.com/v4/spreadsheets',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('DIOS Studio - 2026'),
        })
      )
    })

    it('includes Inspections, Operators, and Expenses tabs', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ spreadsheetId: 'new-sheet-id' }),
      })

      await createMasterSheet(2026)

      const createCall = mockGoogleApiFetch.mock.calls[0]
      const body = JSON.parse(createCall[1].body)

      expect(body.sheets).toHaveLength(3)
      expect(body.sheets[0].properties.title).toBe('Inspections')
      expect(body.sheets[1].properties.title).toBe('Operators')
      expect(body.sheets[2].properties.title).toBe('Expenses')
    })

    it('throws error when creation fails', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(createMasterSheet(2026)).rejects.toThrow(
        'Failed to create spreadsheet: 500 Internal Server Error'
      )
    })

    it('hides ID columns and protects sheets after creation', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ spreadsheetId: 'new-sheet-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })

      await createMasterSheet(2026)

      // Second call should be the batchUpdate
      const batchCall = mockGoogleApiFetch.mock.calls[1]
      expect(batchCall[0]).toContain('batchUpdate')
      const batchBody = JSON.parse(batchCall[1].body)
      expect(batchBody.requests).toHaveLength(6) // 3 hideCol + 3 protectSheet
    })
  })

  describe('getOrCreateMasterSheet', () => {
    it('returns cached spreadsheet ID if valid', async () => {
      mockGetSystemConfig.mockResolvedValue({
        sheetsSpreadsheetId_2026: 'cached-id',
      })
      mockGoogleApiJson.mockResolvedValue({ spreadsheetId: 'cached-id' })

      const result = await getOrCreateMasterSheet(2026, 'user-123')

      expect(result).toBe('cached-id')
      // Should verify the cached ID is still valid
      expect(mockGoogleApiJson).toHaveBeenCalledWith(
        expect.stringContaining('cached-id')
      )
    })

    it('clears invalid cached ID and searches for existing sheet', async () => {
      mockGetSystemConfig.mockResolvedValue({
        sheetsSpreadsheetId_2026: 'invalid-id',
      })
      // First call (verify cached) fails
      mockGoogleApiJson
        .mockRejectedValueOnce(new Error('Not found'))
        // Second call (search) succeeds
        .mockResolvedValueOnce({ files: [{ id: 'found-id' }] })

      const result = await getOrCreateMasterSheet(2026, 'user-123')

      expect(result).toBe('found-id')
      expect(mockSaveSystemConfig).toHaveBeenCalledWith('user-123', expect.objectContaining({
        sheetsSpreadsheetId_2026: '',
      }))
    })

    it('creates new sheet when none exists', async () => {
      mockGetSystemConfig.mockResolvedValue({})
      mockGoogleApiJson.mockResolvedValue({ files: [] })
      mockGoogleApiFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ spreadsheetId: 'created-id' }),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      const result = await getOrCreateMasterSheet(2026, 'user-123')

      expect(result).toBe('created-id')
      expect(mockSaveSystemConfig).toHaveBeenCalledWith('user-123', expect.objectContaining({
        sheetsSpreadsheetId_2026: 'created-id',
      }))
    })
  })

  describe('buildRowFromInspection', () => {
    it('builds row array with all fields', () => {
      const params = {
        inspection: {
          id: 'insp-123',
          date: '2026-01-15',
          status: 'Completed',
          scope: 'Full',
          calculatedMileage: 45,
          calculatedDriveTime: 60,
          additionalHoursLog: 2,
          notes: 'Test notes',
          bundleId: 'bundle-1',
          googleCalendarEventId: 'gcal-123',
          prepHours: 1,
          onsiteHours: 4,
          reportHours: 2,
        },
        operation: {
          name: 'Test Farm',
          address: '123 Farm Rd, Springfield, IL, USA',
          operationType: 'crop',
        },
        agency: { name: 'Test Agency' },
        invoice: {
          invoiceNumber: 'INV-001',
          date: '2026-01-20',
          totalAmount: 500,
          status: 'Paid',
          paidDate: '2026-01-25',
        },
        expenses: [
          { amount: 50, vendor: 'Gas Station' },
          { amount: 25, vendor: 'Office Supplies' },
        ],
      }

      const row = buildRowFromInspection(params)

      expect(row).toHaveLength(27)
      expect(row[0]).toBe('Completed') // Status
      expect(row[1]).toBe('Test Agency') // Agency
      expect(row[2]).toBe('2026-01-15') // Start Date
      expect(row[3]).toBe('Test Farm') // Operation Name
      expect(row[4]).toBe('crop') // Operation Type (was scope)
      expect(row[10]).toBe('INV-001') // Invoice No.
      expect(row[11]).toBe('500') // Amount
      expect(row[12]).toBe('75') // Total expenses
      expect(row[13]).toBe('Yes') // Paid
      expect(row[14]).toBe('45') // Miles
      expect(row[18]).toBe('January') // Month
      expect(row[20]).toBe('Gas Station: $50.00; Office Supplies: $25.00') // Expense Details
      expect(row[26]).toBe('insp-123') // Inspection ID
    })

    it('handles missing optional fields gracefully', () => {
      const params = {
        inspection: { id: 'insp-456', date: '2026-02-01', status: 'Scheduled' },
        operation: null,
        agency: null,
        invoice: null,
        expenses: [],
      }

      const row = buildRowFromInspection(params)

      expect(row).toHaveLength(27)
      expect(row[0]).toBe('Scheduled')
      expect(row[1]).toBe('') // No agency
      expect(row[3]).toBe('') // No operation name
      expect(row[10]).toBe('') // No invoice number
      expect(row[12]).toBe('') // No expenses
      expect(row[26]).toBe('insp-456')
    })

    it('extracts month from date correctly', () => {
      const params = {
        inspection: { id: 'test', date: '2026-07-15', status: 'Test' },
        operation: {},
        agency: {},
        invoice: null,
        expenses: [],
      }

      const row = buildRowFromInspection(params)

      expect(row[18]).toBe('July')
    })

    it('handles invalid date gracefully', () => {
      const params = {
        inspection: { id: 'test', date: 'invalid-date', status: 'Test' },
        operation: {},
        agency: {},
        invoice: null,
        expenses: [],
      }

      const row = buildRowFromInspection(params)

      expect(row[18]).toBe('') // Month should be empty for invalid date
    })

    it('uses milesDriven fallback when calculatedMileage is null', () => {
      const params = {
        inspection: {
          id: 'test',
          date: '2026-01-01',
          status: 'Test',
          calculatedMileage: null,
          milesDriven: 30,
        },
        operation: {},
        agency: {},
        invoice: null,
        expenses: [],
      }

      const row = buildRowFromInspection(params)

      expect(row[14]).toBe('30')
    })
  })

  describe('buildRowFromOperation', () => {
    it('builds row array for operation', () => {
      const params = {
        operation: {
          id: 'op-123',
          name: 'Test Farm',
          operationType: 'handler',
          status: 'active',
          address: '123 Main St, City, ST',
          contactName: 'John Doe',
          phone: '555-1234',
          email: 'john@example.com',
          clientId: 'CLIENT-001',
          cachedDistanceMiles: 25.5,
          cachedDriveTimeMinutes: 35,
          notes: 'Test notes',
        },
        agency: { name: 'Test Agency' },
      }

      const row = buildRowFromOperation(params)

      expect(row).toHaveLength(16)
      expect(row[0]).toBe('Test Farm')
      expect(row[1]).toBe('Test Agency')
      expect(row[2]).toBe('handler')
      expect(row[3]).toBe('active')
      expect(row[4]).toBe('123 Main St, City, ST')
      expect(row[8]).toBe('John Doe')
      expect(row[9]).toBe('555-1234')
      expect(row[10]).toBe('john@example.com')
      expect(row[11]).toBe('CLIENT-001')
      expect(row[12]).toBe('25.5')
      expect(row[13]).toBe('35')
      expect(row[15]).toBe('op-123')
    })

    it('handles quickNote as fallback for notes', () => {
      const params = {
        operation: {
          id: 'op-456',
          name: 'Test',
          notes: '',
          quickNote: 'Quick note text',
        },
        agency: {},
      }

      const row = buildRowFromOperation(params)

      expect(row[14]).toBe('Quick note text')
    })
  })

  describe('buildRowFromExpense', () => {
    it('builds row array for expense', () => {
      const expense = {
        id: 'exp-123',
        date: '2026-01-15',
        vendor: 'Office Depot',
        amount: 75.50,
        category: 'Supplies',
        notes: 'Printer ink',
        inspectionId: 'insp-456',
        receiptImageUrl: 'https://example.com/receipt.jpg',
      }

      const row = buildRowFromExpense(expense)

      expect(row).toHaveLength(8)
      expect(row[0]).toBe('2026-01-15')
      expect(row[1]).toBe('Office Depot')
      expect(row[2]).toBe('75.5')
      expect(row[3]).toBe('Supplies')
      expect(row[4]).toBe('Printer ink')
      expect(row[5]).toBe('insp-456')
      expect(row[6]).toBe('Yes') // Has receipt
      expect(row[7]).toBe('exp-123')
    })

    it('marks receipt as empty when no URL', () => {
      const expense = {
        id: 'exp-789',
        date: '2026-01-20',
        vendor: 'Gas',
        amount: 40,
        category: 'Fuel',
        notes: '',
        inspectionId: '',
        receiptImageUrl: '',
      }

      const row = buildRowFromExpense(expense)

      expect(row[6]).toBe('')
    })
  })

  describe('findRowByInspectionId', () => {
    it('returns row number when inspection ID found', async () => {
      mockGoogleApiJson.mockResolvedValue({
        values: [
          ['Header'], // Row 1 (header)
          ['insp-100'], // Row 2
          ['insp-200'], // Row 3
          ['insp-300'], // Row 4
        ],
      })

      const result = await findRowByInspectionId('sheet-123', 'insp-200')

      expect(result).toBe(3)
    })

    it('returns null when inspection ID not found', async () => {
      mockGoogleApiJson.mockResolvedValue({
        values: [
          ['Header'],
          ['insp-100'],
        ],
      })

      const result = await findRowByInspectionId('sheet-123', 'insp-999')

      expect(result).toBeNull()
    })

    it('returns null when values is undefined', async () => {
      mockGoogleApiJson.mockResolvedValue({})

      const result = await findRowByInspectionId('sheet-123', 'insp-100')

      expect(result).toBeNull()
    })
  })

  describe('syncInspectionRow', () => {
    it('updates existing row when found', async () => {
      // First call: findRowByInspectionId
      mockGoogleApiJson.mockResolvedValue({
        values: [['Header'], ['insp-123']],
      })
      // Second call: PUT update
      mockGoogleApiFetch.mockResolvedValue({ ok: true })

      await syncInspectionRow('sheet-123', 'insp-123', ['data1', 'data2'])

      expect(mockGoogleApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('Inspections!A2%3AAA2'),
        expect.objectContaining({ method: 'PUT' })
      )
    })

    it('appends new row when not found', async () => {
      // findRowByInspectionId returns null
      mockGoogleApiJson.mockResolvedValue({ values: [['Header']] })
      // Append call
      mockGoogleApiFetch.mockResolvedValue({ ok: true })

      await syncInspectionRow('sheet-123', 'insp-new', ['data1', 'data2'])

      expect(mockGoogleApiFetch).toHaveBeenCalledWith(
        expect.stringContaining(':append'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws error when update fails', async () => {
      mockGoogleApiJson.mockResolvedValue({
        values: [['Header'], ['insp-123']],
      })
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      })

      await expect(
        syncInspectionRow('sheet-123', 'insp-123', ['data'])
      ).rejects.toThrow('Failed to update row 2')
    })

    it('throws error when append fails', async () => {
      mockGoogleApiJson.mockResolvedValue({ values: [['Header']] })
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      })

      await expect(
        syncInspectionRow('sheet-123', 'insp-new', ['data'])
      ).rejects.toThrow('Failed to append row')
    })
  })

  describe('fullSync', () => {
    it('clears existing rows and writes new data', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true }) // Clear
        .mockResolvedValueOnce({ ok: true }) // Write

      await fullSync('sheet-123', [
        ['row1-col1', 'row1-col2'],
        ['row2-col1', 'row2-col2'],
      ])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(2)
    })

    it('skips write when rows array is empty', async () => {
      mockGoogleApiFetch.mockResolvedValueOnce({ ok: true }) // Clear

      await fullSync('sheet-123', [])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(1)
    })

    it('throws error when clear fails', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
      })

      await expect(fullSync('sheet-123', [['data']])).rejects.toThrow(
        'Failed to clear sheet'
      )
    })

    it('throws error when write fails', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Error',
        })

      await expect(fullSync('sheet-123', [['data']])).rejects.toThrow(
        'Failed to write rows'
      )
    })
  })

  describe('fullSyncOperators', () => {
    it('clears and writes operators data', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })

      await fullSyncOperators('sheet-123', [['op1'], ['op2']])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(2)
      expect(mockGoogleApiFetch.mock.calls[0][0]).toContain('Operators')
    })

    it('skips write when rows empty', async () => {
      mockGoogleApiFetch.mockResolvedValueOnce({ ok: true })

      await fullSyncOperators('sheet-123', [])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(1)
    })

    it('throws error when clear fails', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(fullSyncOperators('sheet-123', [['data']])).rejects.toThrow(
        'Failed to clear Operators sheet'
      )
    })

    it('throws error when write fails', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(fullSyncOperators('sheet-123', [['data']])).rejects.toThrow(
        'Failed to write Operators rows'
      )
    })
  })

  describe('fullSyncExpenses', () => {
    it('clears and writes expenses data', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: true })

      await fullSyncExpenses('sheet-123', [['exp1'], ['exp2']])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(2)
      expect(mockGoogleApiFetch.mock.calls[0][0]).toContain('Expenses')
    })

    it('skips write when rows empty', async () => {
      mockGoogleApiFetch.mockResolvedValueOnce({ ok: true })

      await fullSyncExpenses('sheet-123', [])

      expect(mockGoogleApiFetch).toHaveBeenCalledTimes(1)
    })

    it('throws error when clear fails', async () => {
      mockGoogleApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(fullSyncExpenses('sheet-123', [['data']])).rejects.toThrow(
        'Failed to clear Expenses sheet'
      )
    })

    it('throws error when write fails', async () => {
      mockGoogleApiFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, status: 500 })

      await expect(fullSyncExpenses('sheet-123', [['data']])).rejects.toThrow(
        'Failed to write Expenses rows'
      )
    })
  })
})
