import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { doc, setDoc, collection } from 'firebase/firestore';
import { geocodeAddress } from '../utils/geocodingUtils';
import { logger } from '@dios/shared';
import type { Agency } from '@dios/shared';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import RateConfigSection from './RateConfigSection';
import SignatureEditor from './SignatureEditor';
import Swal from 'sweetalert2';

interface OnboardingWizardProps {
  isOpen: boolean;
  onComplete: () => void;
}

const STEPS = ['Welcome', 'Address', 'Signature', 'First Agency', 'Done'];

function buildDefaultSignature(name: string, title: string, biz: string, phone: string, email: string): string {
  const parts: string[] = [];
  if (name) parts.push(`<b>${name}</b>`);
  if (title) parts.push(title);
  if (biz) parts.push(biz);
  if (phone) parts.push(phone);
  if (email) parts.push(`<a href="mailto:${email}">${email}</a>`);
  return parts.join('<br/>');
}

export default function OnboardingWizard({ isOpen, onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Welcome
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerTitle, setOwnerTitle] = useState('');

  // Step 2: Address
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 3: Signature
  const [signature, setSignature] = useState('');

  // Step 4: Agency
  const [agencyName, setAgencyName] = useState('');
  const [agencyBillingEmail, setAgencyBillingEmail] = useState('');
  const [agencyContactName, setAgencyContactName] = useState('');
  const [isFlatRate, setIsFlatRate] = useState(true);
  const [flatRateAmount, setFlatRateAmount] = useState(0);
  const [flatRateIncludedHours, setFlatRateIncludedHours] = useState(0);
  const [flatRateOverageRate, setFlatRateOverageRate] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [driveTimeHourlyRate, setDriveTimeHourlyRate] = useState(0);
  const [mileageReimbursed, setMileageReimbursed] = useState(false);
  const [mileageRate, setMileageRate] = useState(0);
  const [perDiemRate, setPerDiemRate] = useState(0);

  const handleNext = () => {
    if (step === 2 && !signature) {
      setSignature(buildDefaultSignature(ownerName, ownerTitle, businessName, phone, email));
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // Save business profile
      const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
      let homebaseLat: number | undefined;
      let homebaseLng: number | undefined;

      if (fullAddress) {
        try {
          const coords = await geocodeAddress(fullAddress);
          if (coords) {
            homebaseLat = coords.lat;
            homebaseLng = coords.lng;
          }
        } catch (err) {
          logger.error('Geocoding failed during onboarding:', err);
        }
      }

      await setDoc(doc(db, `users/${user.uid}/system_settings/config`), {
        businessName,
        ownerName,
        ownerTitle,
        businessAddress: address,
        businessCity: city,
        businessState: state,
        businessZip: zip,
        businessPhone: phone,
        businessEmail: email,
        irsMileageRate: 0.70,
        emailSignatureHtml: signature || buildDefaultSignature(ownerName, ownerTitle, businessName, phone, email),
        homebaseLat,
        homebaseLng,
        onboardingCompleted: true,
      });

      // Create first agency if name provided
      if (agencyName.trim()) {
        const agenciesRef = collection(db, `users/${user.uid}/agencies`);
        const newId = doc(agenciesRef).id;
        const newAgency: Agency = {
          id: newId,
          name: agencyName.trim(),
          billingAddress: '',
          isFlatRate,
          flatRateAmount,
          flatRateIncludedHours,
          flatRateOverageRate,
          hourlyRate,
          driveTimeHourlyRate,
          mileageReimbursed,
          mileageRate,
          perDiemRate,
          perTypeRatesEnabled: false,
          ratesByType: '{}',
          operationTypes: '["crop","handler"]',
          billingEmail: agencyBillingEmail,
          billingContactName: agencyContactName,
          emailTemplateSubject: '{operatorName} Invoice',
          emailTemplateBody: '',
          prepChecklistEnabled: true,
          prepChecklistItems: '["Prep complete"]',
          reportChecklistEnabled: true,
          reportChecklistItems: '["Report complete"]',
          defaultLineItems: '[]',
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await setDoc(doc(db, `users/${user.uid}/agencies/${newId}`), newAgency);
      }

      Swal.fire({ text: 'Setup complete!', icon: 'success', timer: 1500, showConfirmButton: false });
      onComplete();
    } catch (error) {
      logger.error('Onboarding save failed:', error);
      Swal.fire({ text: 'Failed to save. Please try again.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none';
  const labelClass = 'block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Progress */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i <= step ? 'bg-[#D49A6A]' : 'bg-stone-200'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-stone-400 mt-2">Step {step + 1} of {STEPS.length}</p>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-stone-900">Welcome to DIOS Studio</h2>
              <p className="text-sm text-stone-500">Let's set up your business profile.</p>
              <div>
                <label className={labelClass}>Business Name</label>
                <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} placeholder="My Inspection Co." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Your Name</label>
                  <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} placeholder="John Doe" />
                </div>
                <div>
                  <label className={labelClass}>Title</label>
                  <input value={ownerTitle} onChange={(e) => setOwnerTitle(e.target.value)} className={inputClass} placeholder="Inspector" />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-stone-900">Your Address</h2>
              <p className="text-sm text-stone-500">This sets your homebase for distance calculations.</p>
              <div>
                <label className={labelClass}>Street Address</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>City</label>
                  <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <input value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>ZIP</label>
                  <input value={zip} onChange={(e) => setZip(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(555) 555-5555" />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-stone-900">Email Signature</h2>
              <p className="text-sm text-stone-500">This will appear at the bottom of your invoice emails.</p>
              <SignatureEditor
                value={signature || buildDefaultSignature(ownerName, ownerTitle, businessName, phone, email)}
                onChange={setSignature}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-stone-900">First Agency</h2>
              <p className="text-sm text-stone-500">Set up your first agency, or skip to add later.</p>
              <div>
                <label className={labelClass}>Agency Name</label>
                <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={inputClass} placeholder="e.g., MCIA" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Billing Contact</label>
                  <input value={agencyContactName} onChange={(e) => setAgencyContactName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Billing Email</label>
                  <input value={agencyBillingEmail} onChange={(e) => setAgencyBillingEmail(e.target.value)} className={inputClass} />
                </div>
              </div>
              {agencyName.trim() && (
                <RateConfigSection
                  isFlatRate={isFlatRate}
                  flatRateAmount={flatRateAmount}
                  flatRateIncludedHours={flatRateIncludedHours}
                  flatRateOverageRate={flatRateOverageRate}
                  hourlyRate={hourlyRate}
                  driveTimeHourlyRate={driveTimeHourlyRate}
                  mileageReimbursed={mileageReimbursed}
                  mileageRate={mileageRate}
                  perDiemRate={perDiemRate}
                  defaultLineItems={[]}
                  onChange={(field, value) => {
                    const setters: Record<string, (v: any) => void> = {
                      isFlatRate: setIsFlatRate,
                      flatRateAmount: setFlatRateAmount,
                      flatRateIncludedHours: setFlatRateIncludedHours,
                      flatRateOverageRate: setFlatRateOverageRate,
                      hourlyRate: setHourlyRate,
                      driveTimeHourlyRate: setDriveTimeHourlyRate,
                      mileageReimbursed: setMileageReimbursed,
                      mileageRate: setMileageRate,
                      perDiemRate: setPerDiemRate,
                    };
                    if (setters[field]) setters[field](value);
                  }}
                  onLineItemsChange={() => {}}
                />
              )}
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4 py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <Check size={32} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-stone-900">All Set!</h2>
              <p className="text-sm text-stone-500 max-w-sm mx-auto">
                Your business profile is ready. You can always update these settings later.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/50 flex justify-between items-center shrink-0">
          <div>
            {step > 0 && step < 4 && (
              <button onClick={handleBack} className="flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-700 transition-colors">
                <ArrowLeft size={16} /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step < 4 && (
              <button
                onClick={() => { setStep(4); }}
                className="text-sm text-stone-400 hover:text-stone-600 transition-colors"
              >
                Skip
              </button>
            )}
            {step < 4 ? (
              <button
                onClick={handleNext}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Get Started'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
