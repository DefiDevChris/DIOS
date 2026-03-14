import type {
  Agency,
  Inspection,
  Operation,
} from '@dios/shared'
import {
  resolveRates,
  roundToNearestHalfHour,
  calculateInvoiceLineItems,
} from './invoiceCalculator'

// ---------------------------------------------------------------------------
// Helpers – build mocks with sensible defaults
// ---------------------------------------------------------------------------

function buildAgency(overrides: Partial<Agency> = {}): Agency {
  return {
    id: 'agency-1',
    name: 'Test Agency',
    billingAddress: '123 Main St',
    isFlatRate: false,
    flatRateAmount: 0,
    flatRateIncludedHours: 0,
    flatRateOverageRate: 0,
    hourlyRate: 50,
    driveTimeHourlyRate: 35,
    mileageReimbursed: true,
    mileageRate: 0.67,
    perDiemRate: 75,
    perTypeRatesEnabled: false,
    ratesByType: '{}',
    operationTypes: 'Annual,Initial',
    billingEmail: 'billing@agency.com',
    billingContactName: 'Jane Doe',
    emailTemplateSubject: 'Invoice',
    emailTemplateBody: '',
    prepChecklistEnabled: false,
    prepChecklistItems: '[]',
    reportChecklistEnabled: false,
    reportChecklistItems: '[]',
    defaultLineItems: '[]',
    updatedAt: '2026-01-01T00:00:00Z',
    syncStatus: 'synced' as const,
    ...overrides,
  }
}

function buildOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    name: 'Happy Farm',
    agencyId: 'agency-1',
    address: '456 Farm Rd',
    contactName: 'Farmer John',
    phone: '555-1234',
    email: 'john@farm.com',
    status: 'active' as const,
    operationType: 'Annual',
    clientId: 'client-1',
    updatedAt: '2026-01-01T00:00:00Z',
    syncStatus: 'synced' as const,
    ...overrides,
  }
}

function buildInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'insp-1',
    operationId: 'op-1',
    date: '2026-03-14',
    status: 'Invoiced' as const,
    prepHours: 1,
    onsiteHours: 4,
    reportHours: 2,
    baseHoursLog: 7,
    additionalHoursLog: 0,
    milesDriven: 0,
    calculatedMileage: 100,
    calculatedDriveTime: 7200,
    prepChecklistData: '[]',
    reportChecklistData: '[]',
    updatedAt: '2026-01-01T00:00:00Z',
    syncStatus: 'synced' as const,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// resolveRates
// ---------------------------------------------------------------------------

describe('resolveRates', () => {
  it('returns top-level agency rates when perTypeRatesEnabled is false', () => {
    const agency = buildAgency({ perTypeRatesEnabled: false, hourlyRate: 60 })
    const result = resolveRates(agency, 'Annual')

    expect(result.hourlyRate).toBe(60)
    expect(result.isFlatRate).toBe(false)
    expect(result.mileageReimbursed).toBe(true)
  })

  it('returns top-level agency rates when operationType is empty string', () => {
    const agency = buildAgency({ perTypeRatesEnabled: true })
    const result = resolveRates(agency, '')

    expect(result.hourlyRate).toBe(50)
  })

  it('returns per-type rates when enabled and matching type exists', () => {
    const perTypeConfig = {
      Annual: {
        isFlatRate: true,
        flatRateAmount: 500,
        flatRateIncludedHours: 8,
        flatRateOverageRate: 40,
        hourlyRate: 0,
        driveTimeHourlyRate: 30,
        mileageReimbursed: true,
        mileageRate: 0.70,
        perDiemRate: 80,
      },
    }

    const agency = buildAgency({
      perTypeRatesEnabled: true,
      ratesByType: JSON.stringify(perTypeConfig),
    })

    const result = resolveRates(agency, 'Annual')

    expect(result.isFlatRate).toBe(true)
    expect(result.flatRateAmount).toBe(500)
    expect(result.flatRateIncludedHours).toBe(8)
    expect(result.mileageRate).toBe(0.70)
  })

  it('falls back to top-level rates when per-type is enabled but type not found', () => {
    const perTypeConfig = {
      Initial: {
        isFlatRate: true,
        flatRateAmount: 300,
        flatRateIncludedHours: 6,
        flatRateOverageRate: 35,
        hourlyRate: 0,
        driveTimeHourlyRate: 25,
        mileageReimbursed: false,
        mileageRate: 0,
        perDiemRate: 0,
      },
    }

    const agency = buildAgency({
      perTypeRatesEnabled: true,
      ratesByType: JSON.stringify(perTypeConfig),
      hourlyRate: 55,
    })

    const result = resolveRates(agency, 'Annual')

    expect(result.hourlyRate).toBe(55)
    expect(result.isFlatRate).toBe(false)
  })

  it('falls back to top-level rates when ratesByType contains invalid JSON', () => {
    const agency = buildAgency({
      perTypeRatesEnabled: true,
      ratesByType: 'NOT_VALID_JSON{{{',
      hourlyRate: 42,
    })

    const result = resolveRates(agency, 'Annual')

    expect(result.hourlyRate).toBe(42)
    expect(result.isFlatRate).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// roundToNearestHalfHour
// ---------------------------------------------------------------------------

describe('roundToNearestHalfHour', () => {
  it('returns 0 for 0 minutes', () => {
    expect(roundToNearestHalfHour(0)).toBe(0)
  })

  it('rounds 1 minute up to 0.5 hours', () => {
    expect(roundToNearestHalfHour(1)).toBe(0.5)
  })

  it('rounds 15 minutes up to 0.5 hours', () => {
    expect(roundToNearestHalfHour(15)).toBe(0.5)
  })

  it('returns 0.5 for exactly 30 minutes', () => {
    expect(roundToNearestHalfHour(30)).toBe(0.5)
  })

  it('rounds 31 minutes up to 1.0 hours', () => {
    expect(roundToNearestHalfHour(31)).toBe(1.0)
  })

  it('rounds 45 minutes up to 1.0 hours', () => {
    expect(roundToNearestHalfHour(45)).toBe(1.0)
  })

  it('returns 1.0 for exactly 60 minutes', () => {
    expect(roundToNearestHalfHour(60)).toBe(1.0)
  })

  it('rounds 90 minutes to 1.5 hours', () => {
    expect(roundToNearestHalfHour(90)).toBe(1.5)
  })

  it('rounds 100 minutes up to 2.0 hours', () => {
    expect(roundToNearestHalfHour(100)).toBe(2.0)
  })
})

// ---------------------------------------------------------------------------
// calculateInvoiceLineItems
// ---------------------------------------------------------------------------

describe('calculateInvoiceLineItems', () => {
  describe('hourly rate billing', () => {
    it('creates an Inspection Fee line item based on total hours * hourlyRate', () => {
      const agency = buildAgency({
        hourlyRate: 50,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        prepHours: 1,
        onsiteHours: 4,
        reportHours: 2,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems).toHaveLength(1)
      expect(lineItems[0].name).toBe('Inspection Fee')
      expect(lineItems[0].amount).toBe(350) // 7 hrs * $50
      expect(lineItems[0].details).toContain('7')
      expect(total).toBe(350)
    })
  })

  describe('flat rate billing', () => {
    it('creates flat rate Inspection Fee when hours are within included amount', () => {
      const agency = buildAgency({
        isFlatRate: true,
        flatRateAmount: 400,
        flatRateIncludedHours: 8,
        flatRateOverageRate: 45,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        prepHours: 1,
        onsiteHours: 4,
        reportHours: 2,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems).toHaveLength(1)
      expect(lineItems[0].name).toBe('Inspection Fee')
      expect(lineItems[0].amount).toBe(400)
      expect(total).toBe(400)
    })

    it('adds Additional Hours line item when hours exceed included amount', () => {
      const agency = buildAgency({
        isFlatRate: true,
        flatRateAmount: 400,
        flatRateIncludedHours: 6,
        flatRateOverageRate: 45,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        prepHours: 2,
        onsiteHours: 5,
        reportHours: 3,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const feeItem = lineItems.find((i) => i.name === 'Inspection Fee')
      const overageItem = lineItems.find((i) => i.name === 'Additional Hours')

      expect(feeItem).toBeDefined()
      expect(feeItem!.amount).toBe(400)

      expect(overageItem).toBeDefined()
      // 10 total hours - 6 included = 4 overage hours * $45 = $180
      expect(overageItem!.amount).toBe(180)
      expect(total).toBe(580)
    })

    it('does not add Additional Hours when total hours equal included hours', () => {
      const agency = buildAgency({
        isFlatRate: true,
        flatRateAmount: 400,
        flatRateIncludedHours: 7,
        flatRateOverageRate: 45,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        prepHours: 1,
        onsiteHours: 4,
        reportHours: 2,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const overageItem = lineItems.find((i) => i.name === 'Additional Hours')
      expect(overageItem).toBeUndefined()
    })
  })

  describe('drive time', () => {
    it('adds Drive Time when calculatedDriveTime > 0 and driveTimeHourlyRate > 0', () => {
      const agency = buildAgency({
        hourlyRate: 50,
        driveTimeHourlyRate: 35,
        mileageReimbursed: false,
      })
      // 7200 seconds = 120 minutes -> roundToNearestHalfHour(120/60=2 hrs from seconds?)
      // Actually: calculatedDriveTime is in seconds. Code does roundToNearestHalfHour(7200 / 60) = roundToNearestHalfHour(120) = ceil(120/30)*0.5 = 2.0
      const inspection = buildInspection({
        calculatedDriveTime: 7200,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const driveItem = lineItems.find((i) => i.name === 'Drive Time')
      expect(driveItem).toBeDefined()
      expect(driveItem!.amount).toBe(70) // 2.0 hrs * $35
    })

    it('skips Drive Time when calculatedDriveTime is 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 35, mileageReimbursed: false })
      const inspection = buildInspection({ calculatedDriveTime: 0, calculatedMileage: 0 })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Drive Time')).toBeUndefined()
    })

    it('skips Drive Time when driveTimeHourlyRate is 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({ calculatedDriveTime: 3600, calculatedMileage: 0 })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Drive Time')).toBeUndefined()
    })

    it('divides drive time by totalTripStops when bundled', () => {
      const agency = buildAgency({
        hourlyRate: 50,
        driveTimeHourlyRate: 40,
        mileageReimbursed: false,
      })
      // 7200 seconds / 60 = 120 min -> roundToNearestHalfHour(120) = 2.0 hrs
      // bundled with 2 stops -> 2.0 / 2 = 1.0 hrs -> 1.0 * $40 = $40
      const inspection = buildInspection({
        calculatedDriveTime: 7200,
        calculatedMileage: 0,
        isBundled: true,
        totalTripStops: 2,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const driveItem = lineItems.find((i) => i.name === 'Drive Time')
      expect(driveItem).toBeDefined()
      expect(driveItem!.amount).toBe(40)
    })
  })

  describe('mileage', () => {
    it('adds Mileage when mileageReimbursed is true and calculatedMileage > 0', () => {
      const agency = buildAgency({
        mileageReimbursed: true,
        mileageRate: 0.67,
        driveTimeHourlyRate: 0,
      })
      const inspection = buildInspection({
        calculatedMileage: 100,
        calculatedDriveTime: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const mileageItem = lineItems.find((i) => i.name === 'Mileage')
      expect(mileageItem).toBeDefined()
      expect(mileageItem!.amount).toBeCloseTo(67)
    })

    it('skips Mileage when mileageReimbursed is false', () => {
      const agency = buildAgency({ mileageReimbursed: false, driveTimeHourlyRate: 0 })
      const inspection = buildInspection({ calculatedMileage: 100, calculatedDriveTime: 0 })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Mileage')).toBeUndefined()
    })

    it('skips Mileage when calculatedMileage is 0', () => {
      const agency = buildAgency({ mileageReimbursed: true, driveTimeHourlyRate: 0 })
      const inspection = buildInspection({ calculatedMileage: 0, calculatedDriveTime: 0 })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Mileage')).toBeUndefined()
    })

    it('divides mileage by totalTripStops when bundled', () => {
      const agency = buildAgency({
        mileageReimbursed: true,
        mileageRate: 0.50,
        driveTimeHourlyRate: 0,
      })
      const inspection = buildInspection({
        calculatedMileage: 200,
        calculatedDriveTime: 0,
        isBundled: true,
        totalTripStops: 4,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const mileageItem = lineItems.find((i) => i.name === 'Mileage')
      expect(mileageItem).toBeDefined()
      // 200 / 4 = 50 miles * $0.50 = $25
      expect(mileageItem!.amount).toBe(25)
    })
  })

  describe('per diem', () => {
    it('adds Per Diem when perDiemDays > 0 and perDiemRate > 0', () => {
      const agency = buildAgency({
        perDiemRate: 75,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        perDiemDays: 2,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const perDiemItem = lineItems.find((i) => i.name === 'Per Diem')
      expect(perDiemItem).toBeDefined()
      expect(perDiemItem!.amount).toBe(150)
    })

    it('skips Per Diem when perDiemDays is 0', () => {
      const agency = buildAgency({
        perDiemRate: 75,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        perDiemDays: 0,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Per Diem')).toBeUndefined()
    })

    it('skips Per Diem when perDiemRate is 0', () => {
      const agency = buildAgency({
        perDiemRate: 0,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        perDiemDays: 3,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Per Diem')).toBeUndefined()
    })
  })

  describe('meals & expenses', () => {
    it('adds Meals & Expenses when mealsAndExpenses > 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        mealsAndExpenses: 45.50,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const mealsItem = lineItems.find((i) => i.name === 'Meals & Expenses')
      expect(mealsItem).toBeDefined()
      expect(mealsItem!.amount).toBe(45.50)
    })

    it('skips Meals & Expenses when mealsAndExpenses is 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        mealsAndExpenses: 0,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Meals & Expenses')).toBeUndefined()
    })
  })

  describe('agency default line items', () => {
    it('adds default line items from agency when JSON is valid', () => {
      const defaults = [
        { name: 'Admin Fee', amount: 25 },
        { name: 'Technology Fee', amount: 10 },
      ]
      const agency = buildAgency({
        defaultLineItems: JSON.stringify(defaults),
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const adminItem = lineItems.find((i) => i.name === 'Admin Fee')
      const techItem = lineItems.find((i) => i.name === 'Technology Fee')
      expect(adminItem).toBeDefined()
      expect(adminItem!.amount).toBe(25)
      expect(techItem).toBeDefined()
      expect(techItem!.amount).toBe(10)
    })

    it('skips default line items with amount <= 0', () => {
      const defaults = [
        { name: 'Active Fee', amount: 15 },
        { name: 'Zeroed Fee', amount: 0 },
        { name: 'Negative Fee', amount: -5 },
      ]
      const agency = buildAgency({
        defaultLineItems: JSON.stringify(defaults),
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Active Fee')).toBeDefined()
      expect(lineItems.find((i) => i.name === 'Zeroed Fee')).toBeUndefined()
      expect(lineItems.find((i) => i.name === 'Negative Fee')).toBeUndefined()
    })

    it('skips default line items when defaultLineItems is invalid JSON', () => {
      const agency = buildAgency({
        defaultLineItems: 'BROKEN_JSON!!!',
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      // Should only have the Inspection Fee
      expect(lineItems).toHaveLength(1)
      expect(lineItems[0].name).toBe('Inspection Fee')
    })

    it('skips default line items when defaultLineItems is empty string', () => {
      const agency = buildAgency({
        defaultLineItems: '',
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems).toHaveLength(1)
    })
  })

  describe('linked expenses', () => {
    it('adds Linked Expenses when linkedExpenseTotal > 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 150)

      const expenseItem = lineItems.find((i) => i.name === 'Linked Expenses')
      expect(expenseItem).toBeDefined()
      expect(expenseItem!.amount).toBe(150)
    })

    it('skips Linked Expenses when linkedExpenseTotal is 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Linked Expenses')).toBeUndefined()
    })
  })

  describe('custom line item', () => {
    it('adds custom line item when name and amount are set', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        customLineItemName: 'Special Charge',
        customLineItemAmount: 99.99,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      const customItem = lineItems.find((i) => i.name === 'Special Charge')
      expect(customItem).toBeDefined()
      expect(customItem!.amount).toBe(99.99)
    })

    it('skips custom line item when name is empty', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        customLineItemName: '',
        customLineItemAmount: 50,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems).toHaveLength(1) // only Inspection Fee
    })

    it('skips custom line item when amount is 0', () => {
      const agency = buildAgency({ driveTimeHourlyRate: 0, mileageReimbursed: false })
      const inspection = buildInspection({
        customLineItemName: 'Free Item',
        customLineItemAmount: 0,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems.find((i) => i.name === 'Free Item')).toBeUndefined()
    })
  })

  describe('total calculation', () => {
    it('sums all line items into the total', () => {
      const agency = buildAgency({
        hourlyRate: 50,
        driveTimeHourlyRate: 35,
        mileageReimbursed: true,
        mileageRate: 0.50,
        perDiemRate: 75,
        defaultLineItems: JSON.stringify([{ name: 'Admin Fee', amount: 20 }]),
      })
      const inspection = buildInspection({
        prepHours: 1,
        onsiteHours: 4,
        reportHours: 2,
        calculatedDriveTime: 3600, // 60 min -> roundToNearestHalfHour(60/60=1) ... wait
        // calculatedDriveTime is used as: roundToNearestHalfHour(calculatedDriveTime / 60)
        // 3600 / 60 = 60 min -> ceil(60/30)*0.5 = 1.0 hrs
        calculatedMileage: 80,
        perDiemDays: 1,
        mealsAndExpenses: 30,
        customLineItemName: 'Misc',
        customLineItemAmount: 15,
      })
      const operation = buildOperation()

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 50)

      // Inspection Fee: 7 * 50 = 350
      // Drive Time: 1.0 hrs * 35 = 35
      // Mileage: 80 * 0.50 = 40
      // Per Diem: 1 * 75 = 75
      // Meals: 30
      // Admin Fee: 20
      // Linked Expenses: 50
      // Misc: 15
      const expectedTotal = 350 + 35 + 40 + 75 + 30 + 20 + 50 + 15

      expect(lineItems).toHaveLength(8)
      expect(total).toBe(expectedTotal)
    })

    it('returns zero total when all amounts are zero', () => {
      const agency = buildAgency({
        hourlyRate: 0,
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        prepHours: 0,
        onsiteHours: 0,
        reportHours: 0,
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation()

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems).toHaveLength(1) // Inspection Fee at $0
      expect(total).toBe(0)
    })
  })

  describe('per-type rates integration', () => {
    it('uses per-type rates for calculation when available', () => {
      const perTypeConfig = {
        Initial: {
          isFlatRate: true,
          flatRateAmount: 600,
          flatRateIncludedHours: 10,
          flatRateOverageRate: 50,
          hourlyRate: 0,
          driveTimeHourlyRate: 0,
          mileageReimbursed: false,
          mileageRate: 0,
          perDiemRate: 0,
        },
      }
      const agency = buildAgency({
        perTypeRatesEnabled: true,
        ratesByType: JSON.stringify(perTypeConfig),
        hourlyRate: 50, // fallback, should NOT be used
        driveTimeHourlyRate: 0,
        mileageReimbursed: false,
      })
      const inspection = buildInspection({
        calculatedDriveTime: 0,
        calculatedMileage: 0,
      })
      const operation = buildOperation({ operationType: 'Initial' })

      const { lineItems, total } = calculateInvoiceLineItems(inspection, agency, operation, 0)

      expect(lineItems[0].name).toBe('Inspection Fee')
      expect(lineItems[0].amount).toBe(600)
      expect(total).toBe(600)
    })
  })
})
