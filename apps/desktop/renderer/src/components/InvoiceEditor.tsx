import { useState, useMemo } from 'react';
import type { Agency, Inspection, Operation, InvoiceLineItem } from '@dios/shared';
import { calculateInvoiceLineItems } from '../utils/invoiceCalculator';
import { generateInvoicePdf } from '../lib/pdfGenerator';
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
  onSave: (data: { lineItems: InvoiceLineItem[]; total: number; notes: string }) => void;
  onEmail: (pdfBlob: Blob, invoiceNumber: string, total: number) => void;
}

export default function InvoiceEditor({
  isOpen,
  onClose,
  inspection,
  operation,
  agency,
  businessProfile,
  onSave,
  onEmail,
}: InvoiceEditorProps) {
  const invoiceNumber = useMemo(() => `INV-${Date.now().toString(36).toUpperCase()}`, []);

  const calculated = useMemo(
    () => calculateInvoiceLineItems(inspection, agency, operation, 0),
    [inspection, agency, operation]
  );

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(calculated.lineItems);
  const [notes, setNotes] = useState(inspection.invoiceNotes || '');

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

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
    onEmail(blob, invoiceNumber, total);
  };

  const handleSave = () => {
    onSave({ lineItems, total, notes });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Invoice Preview</h2>
            <p className="text-xs text-stone-500 mt-0.5">{invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Bill To / Service For */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Bill To</div>
              <div className="text-sm font-bold text-stone-900">{agency.name}</div>
              <div className="text-sm text-stone-600 whitespace-pre-line">{agency.billingAddress}</div>
              {agency.billingContactName && (
                <div className="text-sm text-stone-500 mt-1">Attn: {agency.billingContactName}</div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Service For</div>
              <div className="text-sm font-bold text-stone-900">{operation.name}</div>
              <div className="text-sm text-stone-600">{operation.address}</div>
              <div className="text-sm text-stone-500 mt-1">
                Inspection: {new Date(inspection.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-6">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Line Items</div>
            <div className="border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-stone-50 text-left">
                    <th className="px-4 py-2 text-xs font-bold text-stone-500 uppercase tracking-wider">Item</th>
                    <th className="px-4 py-2 text-xs font-bold text-stone-500 uppercase tracking-wider">Details</th>
                    <th className="px-4 py-2 text-xs font-bold text-stone-500 uppercase tracking-wider text-right w-32">Amount</th>
                    <th className="px-2 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {lineItems.map((item, index) => (
                    <tr key={index} className="hover:bg-stone-50/50">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          className="w-full bg-transparent text-sm font-medium text-stone-900 outline-none focus:bg-stone-50 rounded px-1 py-0.5 -ml-1"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-stone-500">{item.details || ''}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount}
                          onChange={(e) => handleItemChange(index, 'amount', e.target.value)}
                          className="w-24 bg-transparent text-sm font-medium text-stone-900 text-right outline-none focus:bg-stone-50 rounded px-1 py-0.5"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-stone-300 hover:text-red-500 transition-colors"
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
                className="w-full px-4 py-2 text-sm text-stone-500 hover:text-[#D49A6A] hover:bg-stone-50 transition-colors flex items-center gap-2 border-t border-stone-100"
              >
                <Plus size={14} /> Add Line Item
              </button>
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-end mb-6">
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-6 py-3 text-right">
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">Total</div>
              <div className="text-2xl font-extrabold text-stone-900">${total.toFixed(2)}</div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Invoice notes..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all resize-none outline-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-between items-center shrink-0">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 rounded-xl transition-colors"
          >
            Save Draft
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Download size={16} /> Download PDF
            </button>
            <button
              onClick={handleEmail}
              className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
            >
              <Mail size={16} /> Email to Agency
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
