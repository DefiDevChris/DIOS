import { describe, it, expect } from 'vitest';
import { generateInvoiceNumber, getNextInvoiceNumber } from './invoiceNumbering';

describe('invoiceNumbering', () => {
  it('generates INV-YYYY-0001 format for first invoice of the year', () => {
    const result = generateInvoiceNumber(2026, 0);
    expect(result).toBe('INV-2026-0001');
  });

  it('increments counter correctly', () => {
    const result = generateInvoiceNumber(2026, 42);
    expect(result).toBe('INV-2026-0043');
  });

  it('pads number to 4 digits', () => {
    const result = generateInvoiceNumber(2026, 9);
    expect(result).toBe('INV-2026-0010');
  });

  it('handles large numbers beyond 4 digits', () => {
    const result = generateInvoiceNumber(2026, 9999);
    expect(result).toBe('INV-2026-10000');
  });

  it('getNextInvoiceNumber delegates correctly', () => {
    expect(getNextInvoiceNumber(2026, 5)).toBe('INV-2026-0006');
  });
});
