import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  operationName: string;
  operationAddress: string;
  agencyName: string;

  baseAmount: number;
  baseHours: number;

  additionalHours: number;
  additionalHourlyRate: number;

  driveTime: number;
  travelRate: number;

  milesDriven: number;
  mileageRate: number;

  mealsAndExpenses: number;

  perDiemDays: number;
  perDiemRate: number;

  customLineItemName: string;
  customLineItemAmount: number;

  totalAmount: number;
  notes: string;
}

export const generateInvoicePdf = async (data: InvoiceData): Promise<Blob> => {
  const doc = new jsPDF();

  const margin = 20;
  let y = margin;
  const rightMargin = 190;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(51, 51, 51); // #333333
  doc.text("INVOICE", margin, y);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Invoice Number: ${data.invoiceNumber}`, rightMargin, y, { align: 'right' });
  y += 5;
  doc.text(`Date: ${data.date}`, rightMargin, y, { align: 'right' });

  y += 20;

  // Bill To
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  doc.text("Bill To:", margin, y);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  y += 6;
  doc.text(data.agencyName, margin, y);

  // Service Address
  doc.setFontSize(12);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  doc.text("Service For:", 100, y - 6);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(data.operationName, 100, y);
  y += 5;

  const addressLines = doc.splitTextToSize(data.operationAddress || 'N/A', 80);
  doc.text(addressLines, 100, y);

  y += (addressLines.length * 5) + 15;

  // Table Header
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, y, rightMargin - margin, 10, 'F');

  doc.setFont(undefined, 'bold');
  doc.setTextColor(51, 51, 51);
  doc.text("Description", margin + 2, y + 7);
  doc.text("Amount", rightMargin - 2, y + 7, { align: 'right' });

  y += 15;
  doc.setFont(undefined, 'normal');

  const addLineItem = (description: string, amount: number) => {
    if (amount <= 0) return;
    doc.text(description, margin + 2, y);
    doc.text(`$${amount.toFixed(2)}`, rightMargin - 2, y, { align: 'right' });
    y += 10;
  };

  addLineItem(`Base Rate (${data.baseHours} hrs)`, data.baseAmount);

  if (data.additionalHours > 0) {
    addLineItem(`Additional Hours (${data.additionalHours} @ $${data.additionalHourlyRate}/hr)`, data.additionalHours * data.additionalHourlyRate);
  }

  if (data.driveTime > 0) {
    addLineItem(`Drive Time (${data.driveTime.toFixed(2)} hrs @ $${data.travelRate}/hr)`, data.driveTime * data.travelRate);
  }

  if (data.milesDriven > 0) {
    addLineItem(`Mileage (${data.milesDriven} mi @ $${data.mileageRate.toFixed(3)}/mi)`, data.milesDriven * data.mileageRate);
  }

  if (data.mealsAndExpenses > 0) {
    addLineItem("Meals & Expenses", data.mealsAndExpenses);
  }

  if (data.perDiemDays > 0) {
    addLineItem(`Per Diem (${data.perDiemDays} days @ $${data.perDiemRate}/day)`, data.perDiemDays * data.perDiemRate);
  }

  if (data.customLineItemAmount > 0) {
    addLineItem(data.customLineItemName || "Custom Item", data.customLineItemAmount);
  }

  // Divider
  y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightMargin, y);
  y += 10;

  // Total
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text("Total", rightMargin - 50, y);
  doc.text(`$${data.totalAmount.toFixed(2)}`, rightMargin - 2, y, { align: 'right' });

  // Notes
  if (data.notes) {
    y += 20;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("Notes:", margin, y);
    y += 6;
    doc.setFont(undefined, 'normal');
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
}

export const generateTaxReportPdf = async (data: TaxReportData): Promise<Blob> => {
  const doc = new jsPDF();
  const margin = 20;
  let y = margin;
  const rightMargin = 190;

  // Header
  doc.setFontSize(24);
  doc.setTextColor(51, 51, 51);
  doc.text("Schedule C Export", margin, y);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Year: ${data.year}`, rightMargin, y, { align: 'right' });
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy')}`, rightMargin, y + 5, { align: 'right' });

  y += 20;

  // Income Section
  doc.setFontSize(14);
  doc.setTextColor(51, 51, 51);
  doc.setFont(undefined, 'bold');
  doc.text("Income", margin, y);

  y += 10;
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text("Gross Receipts / Sales:", margin, y);
  doc.text(`$${data.totalIncome.toFixed(2)}`, rightMargin, y, { align: 'right' });

  y += 20;

  // Expenses Section
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text("Expenses (By Category)", margin, y);

  y += 10;
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');

  // Categories
  Object.entries(data.expensesByCategory).forEach(([category, amount]) => {
    if (amount > 0) {
      doc.text(category, margin + 5, y);
      doc.text(`$${amount.toFixed(2)}`, rightMargin, y, { align: 'right' });
      y += 8;
    }
  });

  // Divider
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightMargin, y);
  y += 8;

  // Total Expenses
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text("Total Expenses:", margin, y);
  doc.text(`$${data.totalExpenses.toFixed(2)}`, rightMargin, y, { align: 'right' });

  y += 20;

  // Net Profit/Loss
  doc.setFontSize(16);
  doc.text("Net Profit / Loss:", margin, y);
  const net = data.totalIncome - data.totalExpenses;
  doc.text(`$${net.toFixed(2)}`, rightMargin, y, { align: 'right' });

  return doc.output('blob');
};
