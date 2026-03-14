import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import type { InvoiceData, InvoiceLineItem } from '@dios/shared';

export const generateInvoicePdf = (data: InvoiceData): Blob => {
  const doc = new jsPDF();

  const margin = 20;
  let y = margin;
  const rightMargin = 190;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(51, 51, 51);
  doc.text('INVOICE', margin, y);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Invoice Number: ${data.invoiceNumber}`, rightMargin, y, { align: 'right' });
  y += 5;
  doc.text(`Date: ${data.date}`, rightMargin, y, { align: 'right' });

  y += 15;

  // From
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('From:', margin, y);
  doc.setFont(undefined as unknown as string, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  y += 6;
  doc.text(data.businessName || '', margin, y);
  y += 5;
  if (data.ownerName) { doc.text(data.ownerName, margin, y); y += 5; }
  const fromAddress = doc.splitTextToSize(data.businessAddress || '', 70);
  doc.text(fromAddress, margin, y);
  y += fromAddress.length * 5;
  if (data.businessPhone) { doc.text(data.businessPhone, margin, y); y += 5; }
  if (data.businessEmail) { doc.text(data.businessEmail, margin, y); y += 5; }

  // Bill To (right column, same height as From)
  let billToY = margin + 20;
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Bill To:', 110, billToY);
  doc.setFont(undefined as unknown as string, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  billToY += 6;
  doc.text(data.agencyName, 110, billToY);
  billToY += 5;
  const agencyAddr = doc.splitTextToSize(data.agencyAddress || '', 70);
  doc.text(agencyAddr, 110, billToY);

  y = Math.max(y, billToY + agencyAddr.length * 5) + 10;

  // Service For
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Service For:', margin, y);
  doc.setFont(undefined as unknown as string, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  y += 6;
  doc.text(data.operationName, margin, y);
  y += 5;
  const opAddr = doc.splitTextToSize(data.operationAddress || '', 80);
  doc.text(opAddr, margin, y);
  y += opAddr.length * 5 + 10;

  // Table Header
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, rightMargin - margin, 10, 'F');
  doc.setFont(undefined as unknown as string, 'bold');
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(10);
  doc.text('Description', margin + 2, y + 7);
  doc.text('Details', 100, y + 7);
  doc.text('Amount', rightMargin - 2, y + 7, { align: 'right' });

  y += 15;
  doc.setFont(undefined as unknown as string, 'normal');

  // Line Items
  for (const item of data.lineItems) {
    doc.setTextColor(51, 51, 51);
    doc.text(item.name || '', margin + 2, y);
    doc.setTextColor(130, 130, 130);
    if (item.details) {
      const detailText = doc.splitTextToSize(item.details, 50);
      doc.text(detailText[0] || '', 100, y);
    }
    doc.setTextColor(51, 51, 51);
    doc.text(`$${item.amount.toFixed(2)}`, rightMargin - 2, y, { align: 'right' });
    y += 10;

    if (y > 270) {
      doc.addPage();
      y = margin;
    }
  }

  // Divider
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightMargin, y);
  y += 10;

  // Total
  doc.setFontSize(14);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Total', rightMargin - 50, y);
  doc.text(`$${data.totalAmount.toFixed(2)}`, rightMargin - 2, y, { align: 'right' });

  // Notes
  if (data.notes) {
    y += 20;
    doc.setFontSize(10);
    doc.setFont(undefined as unknown as string, 'bold');
    doc.text('Notes:', margin, y);
    y += 6;
    doc.setFont(undefined as unknown as string, 'normal');
    doc.setTextColor(100, 100, 100);
    const splitNotes = doc.splitTextToSize(data.notes, rightMargin - margin);
    doc.text(splitNotes, margin, y);
  }

  return doc.output('blob');
};

export interface TaxReportData {
  year: number;
  totalIncome: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  totalMiles?: number;
  irsMileageRate?: number;
  mileageDeduction?: number;
}

export const generateTaxReportPdf = (data: TaxReportData): Blob => {
  const doc = new jsPDF();
  const margin = 20;
  let y = margin;
  const rightMargin = 190;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(51, 51, 51);
  doc.text('Schedule C Export', margin, y);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Year: ${data.year}`, rightMargin, y, { align: 'right' });
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy')}`, rightMargin, y + 5, { align: 'right' });

  y += 20;

  // Income Section
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Income', margin, y);
  y += 10;
  doc.setFontSize(12);
  doc.setFont(undefined as unknown as string, 'normal');
  doc.text('Gross Receipts / Sales:', margin, y);
  doc.text(`$${data.totalIncome.toFixed(2)}`, rightMargin, y, { align: 'right' });

  y += 20;

  // Expenses Section
  doc.setFontSize(14);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Expenses (By Category)', margin, y);
  y += 10;
  doc.setFontSize(12);
  doc.setFont(undefined as unknown as string, 'normal');

  for (const [category, amount] of Object.entries(data.expensesByCategory)) {
    if (amount > 0) {
      doc.text(category, margin + 5, y);
      doc.text(`$${amount.toFixed(2)}`, rightMargin, y, { align: 'right' });
      y += 8;
    }
  }

  // Divider
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightMargin, y);
  y += 8;

  // Total Expenses
  doc.setFontSize(12);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Total Expenses:', margin, y);
  doc.text(`$${data.totalExpenses.toFixed(2)}`, rightMargin, y, { align: 'right' });

  y += 20;

  // Mileage Deduction Section
  if (data.totalMiles && data.totalMiles > 0) {
    doc.setFontSize(14);
    doc.setFont(undefined as unknown as string, 'bold');
    doc.text('Mileage Deduction', margin, y);
    y += 10;
    doc.setFontSize(12);
    doc.setFont(undefined as unknown as string, 'normal');

    doc.text('Total Miles Driven:', margin + 5, y);
    doc.text(`${data.totalMiles.toFixed(1)} mi`, rightMargin, y, { align: 'right' });
    y += 8;

    const rate = data.irsMileageRate || 0.70;
    doc.text('IRS Standard Mileage Rate:', margin + 5, y);
    doc.text(`$${rate.toFixed(2)}/mi`, rightMargin, y, { align: 'right' });
    y += 8;

    const deduction = data.mileageDeduction || data.totalMiles * rate;
    doc.setFont(undefined as unknown as string, 'bold');
    doc.text('Mileage Deduction:', margin + 5, y);
    doc.text(`$${deduction.toFixed(2)}`, rightMargin, y, { align: 'right' });
    y += 20;
  }

  // Net Profit/Loss
  doc.setFontSize(16);
  doc.setFont(undefined as unknown as string, 'bold');
  doc.text('Net Profit / Loss:', margin, y);
  const mileageDed = data.mileageDeduction || 0;
  const net = data.totalIncome - data.totalExpenses - mileageDed;
  doc.text(`$${net.toFixed(2)}`, rightMargin, y, { align: 'right' });

  return doc.output('blob');
};
