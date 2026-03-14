import type { InvoiceData } from '@dios/shared'
import {
  generateInvoicePdf,
  generateTaxReportPdf,
  type TaxReportData,
} from './pdfGenerator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInvoiceData(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    invoiceNumber: 'INV-001',
    date: '2026-03-14',
    businessName: 'DIOS Inspections',
    businessAddress: '789 Inspector Ave, Portland, OR 97201',
    businessPhone: '503-555-0100',
    businessEmail: 'info@dios.com',
    ownerName: 'Chris Horan',
    agencyName: 'Test Agency',
    agencyAddress: '123 Agency Blvd, Salem, OR 97301',
    operationName: 'Happy Farm',
    operationAddress: '456 Farm Rd, Bend, OR 97701',
    lineItems: [
      { name: 'Inspection Fee', amount: 350, details: '7 hrs @ $50/hr' },
      { name: 'Mileage', amount: 67, details: '100.0 mi @ $0.67/mi' },
    ],
    totalAmount: 417,
    ...overrides,
  }
}

function buildTaxReportData(overrides: Partial<TaxReportData> = {}): TaxReportData {
  return {
    year: 2026,
    totalIncome: 50000,
    expensesByCategory: {
      'Office Supplies': 1200,
      'Travel': 3500,
      'Insurance': 2000,
    },
    totalExpenses: 6700,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// generateInvoicePdf
// ---------------------------------------------------------------------------

describe('generateInvoicePdf', () => {
  it('returns a Blob', () => {
    const result = generateInvoicePdf(buildInvoiceData())
    expect(result).toBeInstanceOf(Blob)
  })

  it('returns a non-empty Blob with line items', () => {
    const data = buildInvoiceData({
      lineItems: [
        { name: 'Inspection Fee', amount: 350, details: '7 hrs @ $50/hr' },
        { name: 'Drive Time', amount: 70, details: '2.0 hrs @ $35/hr' },
        { name: 'Mileage', amount: 67, details: '100.0 mi @ $0.67/mi' },
      ],
      totalAmount: 487,
    })

    const result = generateInvoicePdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('handles empty line items array', () => {
    const data = buildInvoiceData({
      lineItems: [],
      totalAmount: 0,
    })

    const result = generateInvoicePdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('includes notes section when notes are provided', () => {
    const data = buildInvoiceData({
      notes: 'Payment due within 30 days. Thank you for your business.',
    })

    const result = generateInvoicePdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('generates PDF without notes when notes are not provided', () => {
    const data = buildInvoiceData()
    delete (data as Partial<InvoiceData> & { notes?: string }).notes

    const result = generateInvoicePdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// generateTaxReportPdf
// ---------------------------------------------------------------------------

describe('generateTaxReportPdf', () => {
  it('returns a Blob', () => {
    const result = generateTaxReportPdf(buildTaxReportData())
    expect(result).toBeInstanceOf(Blob)
  })

  it('generates PDF with mileage data', () => {
    const data = buildTaxReportData({
      totalMiles: 12000,
      irsMileageRate: 0.70,
      mileageDeduction: 8400,
    })

    const result = generateTaxReportPdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('generates PDF without mileage data when totalMiles is undefined', () => {
    const data = buildTaxReportData({
      totalMiles: undefined,
      irsMileageRate: undefined,
      mileageDeduction: undefined,
    })

    const result = generateTaxReportPdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })

  it('generates PDF with expense categories', () => {
    const data = buildTaxReportData({
      expensesByCategory: {
        'Office Supplies': 1500,
        'Travel': 4200,
        'Insurance': 2800,
        'Professional Services': 3000,
        'Software': 600,
      },
      totalExpenses: 12100,
    })

    const result = generateTaxReportPdf(data)
    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBeGreaterThan(0)
  })
})
