import { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Agency, Operation } from '@dios/shared';
import { renderTemplate } from '../utils/templateRenderer';
import { logger } from '@dios/shared';
import { X, Paperclip } from 'lucide-react';
import Swal from 'sweetalert2';

interface InvoiceEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agency: Agency;
  operation: Operation;
  invoiceNumber: string;
  totalAmount: number;
  inspectionDate: string;
  pdfBlob: Blob;
  signatureHtml: string;
  onSent: () => void;
}

export default function InvoiceEmailModal({
  isOpen,
  onClose,
  agency,
  operation,
  invoiceNumber,
  totalAmount,
  inspectionDate,
  pdfBlob,
  signatureHtml,
  onSent,
}: InvoiceEmailModalProps) {
  const { googleAccessToken } = useAuth();

  const templateVars = useMemo(
    () => ({
      agencyName: agency.name,
      agencyContact: agency.billingContactName,
      operatorName: operation.name,
      operationAddress: operation.address,
      invoiceNumber,
      totalAmount: `$${totalAmount.toFixed(2)}`,
      inspectionDate: new Date(inspectionDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    }),
    [agency, operation, invoiceNumber, totalAmount, inspectionDate]
  );

  const [toEmail, setToEmail] = useState(agency.billingEmail || '');
  const [subject, setSubject] = useState(
    renderTemplate(agency.emailTemplateSubject || '{operatorName} Invoice', templateVars)
  );
  const [body, setBody] = useState(
    renderTemplate(agency.emailTemplateBody || defaultBody(), templateVars)
  );
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const token = googleAccessToken || localStorage.getItem('googleAccessToken');
    if (!token || token === 'dummy') {
      Swal.fire({ text: 'Please sign in with Google to send emails.', icon: 'info' });
      return;
    }
    if (!toEmail) {
      Swal.fire({ text: 'No recipient email address.', icon: 'warning' });
      return;
    }

    setSending(true);
    try {
      const pdfBuffer = await pdfBlob.arrayBuffer();
      const pdfBase64 = btoa(
        new Uint8Array(pdfBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const boundary = `boundary_${Date.now()}`;
      const htmlBody = body.replace(/\n/g, '<br>') + (signatureHtml ? `<br><br>${signatureHtml}` : '');

      const messageParts = [
        `To: ${toEmail}`,
        `Subject: ${subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        htmlBody,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${invoiceNumber}.pdf"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${invoiceNumber}.pdf"`,
        '',
        pdfBase64,
        `--${boundary}--`,
      ].join('\r\n');

      const encoded = btoa(unescape(encodeURIComponent(messageParts)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded }),
      });

      if (!res.ok) throw new Error(`Gmail send error: ${res.status}`);

      Swal.fire({ text: 'Invoice sent!', icon: 'success', timer: 1500, showConfirmButton: false });
      onSent();
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send invoice email:', error);
      Swal.fire({ text: `Failed to send: ${message}`, icon: 'error' });
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
          <h2 className="text-lg font-bold text-stone-900">Send Invoice</h2>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">To</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-stone-500 bg-stone-50 px-3 py-2 rounded-lg border border-stone-100">
            <Paperclip size={14} />
            <span>{invoiceNumber}.pdf</span>
            <span className="text-xs text-stone-400">({(pdfBlob.size / 1024).toFixed(1)} KB)</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-600 hover:text-stone-900 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !toEmail}
            className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultBody(): string {
  return 'Hey {agencyContact},\n\nHere is the invoice for the completed inspection for {operatorName}.\n\nPlease let me know if you have any questions.\n\nThank you';
}
