import { useState, useRef } from 'react';
import { Upload, Loader2, Save, FileText, Calendar, DollarSign, Building2 } from 'lucide-react';
import Tesseract from 'tesseract.js';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const extractDate = (text: string): string => {
  // Matches MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD
  const dateRegex = /\b(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/;
  const match = text.match(dateRegex);
  if (match) {
    try {
      // Basic normalization to YYYY-MM-DD for input type="date"
      const parts = match[0].split(/[\/\.-]/);
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        // MM/DD/YY or MM/DD/YYYY
        let year = parts[2];
        if (year.length === 2) {
          year = `20${year}`;
        }
        return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    } catch {
      return '';
    }
  }
  return '';
};

const extractAmount = (text: string): string => {
  // Find the largest amount or amount following total/amount/$
  const lines = text.split('\n');
  let maxAmount = 0;

  // Try to find "total" first
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('total') || lowerLine.includes('amount')) {
      const match = line.match(/\$?(\d+\.\d{2})/);
      if (match) {
        return match[1];
      }
    }
  }

  // Fallback: finding the largest currency value
  const amountRegex = /\$?(\d+\.\d{2})/g;
  const matches = [...text.matchAll(amountRegex)];

  if (matches.length > 0) {
    for (const match of matches) {
      const val = parseFloat(match[1]);
      if (val > maxAmount) {
        maxAmount = val;
      }
    }
    return maxAmount > 0 ? maxAmount.toFixed(2) : '';
  }
  return '';
};

const extractVendor = (text: string): string => {
  // Usually the first non-empty line with letters
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines) {
    if (/[a-zA-Z]{3,}/.test(line)) {
      // Basic cleanup, strip special chars at ends
      return line.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z0-9\s]+$/, '').trim();
    }
  }
  return '';
};

export default function ReceiptScanner() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [rawText, setRawText] = useState('');

  // Form State
  const [parsedData, setParsedData] = useState({
    date: '',
    vendor: '',
    amount: '',
    notes: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { user } = useAuth();

  const processImage = async (imageUrl: string) => {
    setIsScanning(true);
    setScanProgress(0);
    setRawText('');

    try {
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setScanProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(imageUrl);
      setRawText(text);

      setParsedData({
        date: extractDate(text),
        vendor: extractVendor(text),
        amount: extractAmount(text),
        notes: ''
      });

      await worker.terminate();
    } catch (error) {
      console.error('OCR Error:', error);
      alert('Failed to process image. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedImage(url);
      setSaveSuccess(false);
      processImage(url);
    }
  };

  const handleSave = async () => {
    if (!user || !db) return;

    // Validate required fields
    if (!parsedData.date || !parsedData.vendor || !parsedData.amount) {
      alert('Please fill in Date, Vendor, and Amount');
      return;
    }

    setIsSaving(true);
    try {
      const newDocRef = doc(collection(db, `users/${user.uid}/expenses`));
      await setDoc(newDocRef, {
        id: newDocRef.id,
        date: parsedData.date,
        vendor: parsedData.vendor,
        amount: parseFloat(parsedData.amount),
        notes: parsedData.notes || '',
        // receiptImageUrl: '' // To be implemented later with Storage/Drive
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSelectedImage(null);
        setRawText('');
        setSaveSuccess(false);
      }, 3000);

    } catch (error) {
      console.error('Error saving expense:', error);
      alert('Failed to save expense');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
      <h2 className="text-xl font-bold text-stone-900 mb-6">Scan Receipt</h2>

      {!selectedImage ? (
        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50">
          <Upload size={32} className="text-stone-400 mb-4" />
          <p className="text-sm font-medium text-stone-600 mb-2">Upload or capture receipt</p>
          <label className="cursor-pointer bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            Select Image
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="relative rounded-2xl overflow-hidden bg-stone-100 max-h-64 flex justify-center">
            <img src={selectedImage} alt="Receipt preview" className="object-contain max-h-64" />
            {!isScanning && (
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setRawText('');
                }}
                className="absolute top-2 right-2 bg-stone-900/50 text-white px-3 py-1 rounded-lg text-xs hover:bg-stone-900/70 transition-colors"
              >
                Clear
              </button>
            )}

            {isScanning && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#D49A6A] mb-4" size={32} />
                <p className="text-stone-900 font-medium">Scanning receipt...</p>
                <div className="w-48 h-2 bg-stone-200 rounded-full mt-4 overflow-hidden">
                  <div
                    className="h-full bg-[#D49A6A] transition-all duration-300 ease-out"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-xs text-stone-500 mt-2">{scanProgress}%</p>
              </div>
            )}
          </div>

          {rawText && !isScanning && (
            <div className="space-y-4">
              <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
                <h3 className="text-sm font-bold text-stone-900 mb-4 flex items-center gap-2">
                  <FileText size={16} className="text-[#D49A6A]" />
                  Verify Extracted Details
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-1">
                      <Building2 size={14} /> Vendor
                    </label>
                    <input
                      type="text"
                      value={parsedData.vendor}
                      onChange={(e) => setParsedData({...parsedData, vendor: e.target.value})}
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
                      placeholder="e.g. Home Depot"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-1">
                        <Calendar size={14} /> Date
                      </label>
                      <input
                        type="date"
                        value={parsedData.date}
                        onChange={(e) => setParsedData({...parsedData, date: e.target.value})}
                        className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-1">
                        <DollarSign size={14} /> Amount
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-stone-500 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={parsedData.amount}
                          onChange={(e) => setParsedData({...parsedData, amount: e.target.value})}
                          className="w-full bg-white border border-stone-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-1">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={parsedData.notes}
                      onChange={(e) => setParsedData({...parsedData, notes: e.target.value})}
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]/50 transition-all"
                      rows={2}
                      placeholder="What was this for?"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSave}
                  disabled={isSaving || saveSuccess}
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <><Loader2 size={16} className="animate-spin" /> Saving...</>
                  ) : saveSuccess ? (
                    <>Saved Successfully!</>
                  ) : (
                    <><Save size={16} /> Save Expense</>
                  )}
                </button>
              </div>

              <details className="group">
                <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700 font-medium select-none list-none flex items-center gap-1">
                  <span className="group-open:hidden">▶</span>
                  <span className="hidden group-open:inline">▼</span>
                  View Raw OCR Text
                </summary>
                <pre className="mt-2 p-3 bg-stone-50 rounded-lg border border-stone-100 text-[10px] text-stone-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {rawText}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
