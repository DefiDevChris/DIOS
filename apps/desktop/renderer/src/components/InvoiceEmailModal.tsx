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
    if (!token) {
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
      const bytes = new Uint8Array(pdfBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const pdfBase64 = btoa(binary);

      const boundary = `boundary_${Date.now()}`;
      const htmlBody = body.replace(/\n/g, '<br>');

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

      if (!res.ok) {
        if (res.status === 401) {
          Swal.fire({ text: 'Your Google session has expired. Please sign out and sign in again.', icon: 'warning' });
          return;
        }
        throw new Error(`Gmail send error: ${res.status}`);
      }

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
    <div className="luxury-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="luxury-modal-card rounded-[28px] w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-6 py-5 flex items-center justify-between shrink-0">
          <h2 className="font-serif-display text-2xl font-semibold text-[#2a2420]">Send Invoice</h2>
          <button onClick={onClose} className="p-2 text-[#a89b8c] hover:text-[#2a2420] rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="luxury-divider mx-6" />

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">To</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full resize-none luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none"
            />
          </div>
          <div className="flex items-center gap-2.5 text-sm text-[#7a6b5a] font-body px-4 py-3 rounded-2xl" style={{ background: 'rgba(212, 165, 116, 0.08)', border: '1px solid rgba(212, 165, 116, 0.15)' }}>
            <div className="luxury-icon-pill w-7 h-7 flex items-center justify-center rounded-lg">
              <Paperclip size={14} className="text-[#d4a574]" />
            </div>
            <span className="font-medium text-[#2a2420]">{invoiceNumber}.pdf</span>
            <span className="text-xs text-[#a89b8c]">({(pdfBlob.size / 1024).toFixed(1)} KB)</span>
          </div>
        </div>

        <div className="px-6 py-4 flex justify-end gap-3 shrink-0" style={{ borderTop: '1px solid rgba(212, 165, 116, 0.15)', background: 'linear-gradient(135deg, rgba(250,248,245,0.5) 0%, rgba(255,255,255,0.5) 100%)' }}>
          <button
            onClick={onClose}
            className="luxury-btn-secondary px-6 py-3 text-sm font-medium rounded-2xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !toEmail}
            className="luxury-btn text-white px-8 py-4 rounded-2xl text-[15px] font-bold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
