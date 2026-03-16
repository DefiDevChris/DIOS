import { useState, useMemo } from 'react';
import type { Agency, Inspection, Operation, InvoiceLineItem } from '@dios/shared';
import { calculateLiveInvoiceLineItems } from '../utils/invoiceCalculator';
import { generateInvoicePdf } from '../lib/pdfGenerator';
import { getNextInvoiceNumber } from '../utils/invoiceNumbering';
import { Plus, Trash2, Download, Mail, X } from 'lucide-react';

interface InvoiceEditorProps {
  isOpen: boolean;
  onClose: () => void;
  inspection: Inspection;
  operation: Operation;
  agency: Agency;
  businessProfile: {
    businessName: string;
    ownerName: string;
    businessAddress: string;
    businessPhone: string;
    businessEmail: string;
  };
  /** Pre-generated invoice number — caller should pass a persistent number */
  invoiceNumber?: string;
  /** Total existing invoices for the year, used to generate a number if none provided */
  existingInvoiceCount?: number;
  onSave: (data: { lineItems: InvoiceLineItem[]; total: number; notes: string }) => void;
  onEmail: (pdfBlob: Blob, invoiceNumber: string, total: number, lineItems: InvoiceLineItem[], notes: string) => void;
}

export default function InvoiceEditor({
  isOpen,
  onClose,
  inspection,
  operation,
  agency,
  businessProfile,
  invoiceNumber: invoiceNumberProp,
  existingInvoiceCount = 0,
  onSave,
  onEmail,
}: InvoiceEditorProps) {
  const invoiceNumber = useMemo(
    () => invoiceNumberProp ?? getNextInvoiceNumber(new Date(inspection.date).getFullYear(), existingInvoiceCount),
    [invoiceNumberProp, existingInvoiceCount, inspection.date]
  );

  const calculated = useMemo(
    // 0 = no additional expenses to include in line items
    () => calculateLiveInvoiceLineItems(inspection, agency, operation, 0),
    [inspection, agency, operation]
  );

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(calculated.lineItems);
  const [notes, setNotes] = useState(inspection.invoiceNotes || '');

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const confirmedTotal = lineItems.filter(i => !i.estimated).reduce((sum, i) => sum + i.amount, 0);
  const hasEstimated = lineItems.some(i => i.estimated);

  const handleItemChange = (index: number, field: 'name' | 'amount', value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item
      )
    );
  };

  const handleAddItem = () => {
    setLineItems((prev) => [...prev, { name: '', amount: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePrint = async () => {
    const invoiceData = {
      invoiceNumber,
      date: new Date().toISOString().split('T')[0],
      businessName: businessProfile.businessName,
      businessAddress: businessProfile.businessAddress,
      businessPhone: businessProfile.businessPhone,
      businessEmail: businessProfile.businessEmail,
      ownerName: businessProfile.ownerName,
      agencyName: agency.name,
      agencyAddress: agency.billingAddress,
      operationName: operation.name,
      operationAddress: operation.address,
      lineItems,
      totalAmount: total,
      notes,
    };

    const blob = generateInvoicePdf(invoiceData);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEmail = async () => {
    const invoiceData = {
      invoiceNumber,
      date: new Date().toISOString().split('T')[0],
      businessName: businessProfile.businessName,
      businessAddress: businessProfile.businessAddress,
      businessPhone: businessProfile.businessPhone,
      businessEmail: businessProfile.businessEmail,
      ownerName: businessProfile.ownerName,
      agencyName: agency.name,
      agencyAddress: agency.billingAddress,
      operationName: operation.name,
      operationAddress: operation.address,
      lineItems,
      totalAmount: total,
      notes,
    };

    const blob = generateInvoicePdf(invoiceData);
    const cleanItems = lineItems.map(({ estimated: _est, ...item }) => item);
    onEmail(blob, invoiceNumber, total, cleanItems, notes);
  };

  const handleSave = () => {
    const valid = lineItems
      .filter(i => i.name.trim())
      .map(({ estimated: _est, ...item }) => item);
    onSave({ lineItems: valid, total: valid.reduce((s, i) => s + i.amount, 0), notes });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 luxury-modal-backdrop animate-in fade-in duration-200">
      <div className="luxury-card rounded-[24px] shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-[rgba(212,165,116,0.12)] flex items-center justify-between bg-[rgba(212,165,116,0.03)] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[#2a2420]">Invoice Preview</h2>
            <p className="text-xs text-[#8b7355] mt-0.5">
              {invoiceNumber}
              {hasEstimated && (
                <span className="ml-2 text-[#a89b8c] italic">· {inspection.status} — some items estimated</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-[#a89b8c] hover:text-[#7a6b5a] rounded-lg hover:bg-[rgba(212,165,116,0.06)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Bill To / Service For */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="text-[10px] font-bold text-[#a89b8c] uppercase tracking-wider mb-2">Bill To</div>
              <div className="text-sm font-bold text-[#2a2420]">{agency.name}</div>
              <div className="text-sm text-[#7a6b5a] whitespace-pre-line">{agency.billingAddress}</div>
              {agency.billingContactName && (
                <div className="text-sm text-[#8b7355] mt-1">Attn: {agency.billingContactName}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#a89b8c] uppercase tracking-wider mb-2">Service For</div>
              <div className="text-sm font-bold text-[#2a2420]">{operation.name}</div>
              <div className="text-sm text-[#7a6b5a]">{operation.address}</div>
              <div className="text-sm text-[#8b7355] mt-1">
                Inspection: {new Date(inspection.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold text-[#a89b8c] uppercase tracking-wider">Line Items</div>
          {lineItems.some(i => i.estimated) && (
            <div className="text-[10px] text-[#a89b8c] italic">* grey italic = estimated, not yet recorded</div>
          )}
        </div>
            <div className="border border-[rgba(212,165,116,0.15)] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[rgba(212,165,116,0.04)] text-left">
                    <th className="px-4 py-2 text-xs font-bold text-[#8b7355] uppercase tracking-wider">Item</th>
                    <th className="px-4 py-2 text-xs font-bold text-[#8b7355] uppercase tracking-wider">Details</th>
                    <th className="px-4 py-2 text-xs font-bold text-[#8b7355] uppercase tracking-wider text-right w-32">Amount</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(212,165,116,0.12)]">
                  {lineItems.map((item, index) => (
                    <tr key={index} className={`hover:bg-[rgba(212,165,116,0.03)] ${item.estimated ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          className={`w-full bg-transparent text-sm outline-none focus:bg-[rgba(212,165,116,0.04)] rounded px-1 py-0.5 -ml-1 ${
                            item.estimated
                              ? 'italic text-[#a89b8c] font-normal'
                              : 'font-medium text-[#2a2420]'
                          }`}
                        />
                      </td>
                      <td className={`px-4 py-2 text-xs ${item.estimated ? 'italic text-[#b8a898]' : 'text-[#8b7355]'}`}>
                        {item.details || ''}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                          className={`w-24 bg-transparent text-sm text-right outline-none focus:bg-[rgba(212,165,116,0.04)] rounded px-1 py-0.5 ${
                            item.estimated
                              ? 'italic text-[#a89b8c] font-normal'
                              : 'font-medium text-[#2a2420]'
                          }`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-[#d4a574] hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={handleAddItem}
                className="w-full px-4 py-2 text-sm text-[#8b7355] hover:text-[#d4a574] hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2 border-t border-[rgba(212,165,116,0.12)]"
              >
                <Plus size={14} /> Add Line Item
              </button>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end mb-6">
            <div className="bg-[rgba(212,165,116,0.04)] border border-[rgba(212,165,116,0.15)] rounded-xl px-6 py-3 text-right">
              {hasEstimated ? (
                <>
                  <div className="text-xs font-bold text-[#a89b8c] uppercase tracking-wider mb-1">Confirmed</div>
                  <div className="text-2xl font-extrabold text-[#2a2420]">${confirmedTotal.toFixed(2)}</div>
                  <div className="text-xs text-[#a89b8c] italic mt-1">Est. total: ${total.toFixed(2)}</div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold text-[#a89b8c] uppercase tracking-wider mb-1">Total</div>
                  <div className="text-2xl font-extrabold text-[#2a2420]">${total.toFixed(2)}</div>
                </>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-bold text-[#a89b8c] uppercase tracking-wider mb-2">Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Invoice notes..."
              className="w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[rgba(212,165,116,0.12)] bg-[rgba(212,165,116,0.03)] flex justify-between items-center shrink-0">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-[#7a6b5a] hover:text-[#2a2420] hover:bg-[rgba(212,165,116,0.06)] rounded-xl transition-colors"
          >
            Save Draft
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-[rgba(212,165,116,0.15)] text-[#4a4038] rounded-xl text-sm font-medium hover:bg-[rgba(212,165,116,0.04)] transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download size={16} /> Download PDF
            </button>
            <button
              onClick={handleEmail}
              className="luxury-btn text-white px-5 py-2 rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors shadow-sm flex items-center gap-2"
            >
              <Mail size={16} /> Email to Agency
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
