import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

interface Inspection {
  id: string;
  operationId: string;
  date: string;
  status: string;
  baseHoursLog: number;
  additionalHoursLog: number;
  milesDriven: number;
  notes?: string;
  isBundled?: boolean;
  totalTripDriveTime?: number;
  totalTripStops?: number;
  sharedDriveTime?: number;
  mealsAndExpenses?: number;
  perDiemDays?: number;
  customLineItemName?: string;
  customLineItemAmount?: number;
  invoiceNotes?: string;
  invoiceExceptions?: string;
  bundleId?: string;
}

interface Operation {
  id: string;
  name: string;
  agencyId: string;
  address: string;
}

interface Agency {
  id: string;
  name: string;
  flatRateBaseAmount: number;
  flatRateIncludedHours: number;
  additionalHourlyRate: number;
  mileageRate: number;
  travelTimeHourlyRate?: number;
  perDiemRate?: number;
}

interface InvoiceData {
  inspection: Inspection;
  operation: Operation;
  agency: Agency;
  invoiceNumber: string;
  dateGenerated: string;
}

export function generateInvoicePDF(data: InvoiceData): jsPDF {
  const { inspection, operation, agency, invoiceNumber, dateGenerated } = data;

  const doc = new jsPDF();
  const marginX = 20;
  let currentY = 20;

  // Helper to add line and move down
  const addText = (text: string, x: number, y: number, size = 12, isBold = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(text, x, y);
  };

  // Header
  addText('INVOICE', marginX, currentY, 24, true);
  currentY += 10;

  addText(`Invoice #: ${invoiceNumber}`, marginX, currentY, 12);
  currentY += 6;
  addText(`Date: ${format(new Date(dateGenerated), 'MMM d, yyyy')}`, marginX, currentY, 12);
  currentY += 15;

  // Bill To
  addText('BILL TO:', marginX, currentY, 12, true);
  currentY += 6;
  addText(agency.name, marginX, currentY, 12);
  currentY += 15;

  // Inspection Details
  addText('INSPECTION DETAILS:', marginX, currentY, 12, true);
  currentY += 6;
  addText(`Operation: ${operation.name}`, marginX, currentY, 12);
  currentY += 6;
  addText(`Address: ${operation.address}`, marginX, currentY, 12);
  currentY += 6;
  addText(`Inspection Date: ${format(new Date(inspection.date), 'MMM d, yyyy')}`, marginX, currentY, 12);
  currentY += 15;

  // Itemized Billing Header
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, currentY, 170, 10, 'F');
  addText('Description', marginX + 2, currentY + 7, 10, true);
  addText('Qty', 120, currentY + 7, 10, true);
  addText('Rate', 140, currentY + 7, 10, true);
  addText('Amount', 170, currentY + 7, 10, true);
  currentY += 15;

  let total = 0;

  const addLineItem = (description: string, qty: number | string, rate: number, amount: number) => {
    addText(description, marginX + 2, currentY, 10);
    addText(qty.toString(), 120, currentY, 10);
    addText(`$${rate.toFixed(2)}`, 140, currentY, 10);
    addText(`$${amount.toFixed(2)}`, 170, currentY, 10);
    currentY += 8;
    total += amount;
  };

  // Base Rate
  addLineItem(
    `Base Rate (${agency.flatRateIncludedHours} hrs included)`,
    1,
    agency.flatRateBaseAmount,
    agency.flatRateBaseAmount
  );

  // Additional Hours
  if (inspection.additionalHoursLog > 0) {
    addLineItem(
      'Additional Inspection Hours',
      inspection.additionalHoursLog,
      agency.additionalHourlyRate,
      inspection.additionalHoursLog * agency.additionalHourlyRate
    );
  }

  // Drive Time
  const isBundled = inspection.isBundled || false;
  const totalTripStops = inspection.totalTripStops || 1;
  const totalTripDriveTime = inspection.totalTripDriveTime || 0;

  let driveTime = 0;
  if (isBundled && totalTripStops > 0) {
    driveTime = Math.round(totalTripDriveTime) / totalTripStops;
  } else {
    driveTime = totalTripDriveTime;
  }

  if (driveTime > 0) {
    const travelRate = agency.travelTimeHourlyRate || agency.additionalHourlyRate;
    addLineItem(
      `Drive Time${isBundled ? ` (Bundled: ${totalTripDriveTime}h / ${totalTripStops} stops)` : ''}`,
      driveTime.toFixed(2),
      travelRate,
      driveTime * travelRate
    );
  }

  // Mileage
  if (inspection.milesDriven > 0) {
    addLineItem(
      'Mileage',
      inspection.milesDriven,
      agency.mileageRate,
      inspection.milesDriven * agency.mileageRate
    );
  }

  // Meals and Expenses
  if (inspection.mealsAndExpenses && inspection.mealsAndExpenses > 0) {
    addLineItem(
      'Meals & Expenses',
      1,
      inspection.mealsAndExpenses,
      inspection.mealsAndExpenses
    );
  }

  // Per Diem
  if (inspection.perDiemDays && inspection.perDiemDays > 0) {
    const perDiemRate = agency.perDiemRate || 0;
    addLineItem(
      'Per Diem',
      inspection.perDiemDays,
      perDiemRate,
      inspection.perDiemDays * perDiemRate
    );
  }

  // Custom Line Item
  if (inspection.customLineItemAmount && inspection.customLineItemAmount > 0) {
    addLineItem(
      inspection.customLineItemName || 'Custom Item',
      1,
      inspection.customLineItemAmount,
      inspection.customLineItemAmount
    );
  }

  currentY += 5;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, currentY, 190, currentY);
  currentY += 8;

  // Total
  addText('TOTAL:', 140, currentY, 12, true);
  addText(`$${total.toFixed(2)}`, 170, currentY, 12, true);

  currentY += 20;

  // Notes
  if (inspection.invoiceNotes) {
    addText('Notes:', marginX, currentY, 10, true);
    currentY += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(inspection.invoiceNotes, 170);
    doc.text(splitNotes, marginX, currentY);
  }

  return doc;
}
