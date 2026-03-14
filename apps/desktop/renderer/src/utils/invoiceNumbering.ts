/**
 * Generates a sequential invoice number in format INV-YYYY-NNNN.
 * @param year - The invoice year
 * @param currentCount - The current count of invoices for that year (0-based)
 * @returns Formatted invoice number string
 */
export function generateInvoiceNumber(year: number, currentCount: number): string {
  const nextNumber = currentCount + 1;
  const padded = nextNumber.toString().padStart(4, '0');
  return `INV-${year}-${padded}`;
}

/**
 * Gets the next invoice number by counting existing invoices for the year.
 */
export function getNextInvoiceNumber(year: number, existingCount: number): string {
  return generateInvoiceNumber(year, existingCount);
}
