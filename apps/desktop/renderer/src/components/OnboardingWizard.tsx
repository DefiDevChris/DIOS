import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDatabase } from '../hooks/useDatabase';
import { saveSystemConfig } from '../utils/systemConfig';
import { geocodeAddress } from '../utils/geocodingUtils';
import { logger } from '@dios/shared';
import type { Agency } from '@dios/shared';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import RateConfigSection from './RateConfigSection';
import LeafLogo from './LeafLogo';
import Swal from 'sweetalert2';

interface OnboardingWizardProps {
  isOpen: boolean;
  onComplete: () => void;
}

const STEPS = ['Welcome', 'Address', 'First Agency', 'Done'];

function ProgressRing({ current, total }: { current: number; total: number }) {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (current / total) * circumference;

  return (
    <div className="relative">
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}>
        <circle className="ring-bg" cx="50" cy="50" r="45" />
        <circle className="ring-progress" cx="50" cy="50" r="45" style={{ strokeDashoffset: offset }} />
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-bold text-white tracking-widest">
        {current}/{total}
      </div>
    </div>
  );
}

export default function OnboardingWizard({ isOpen, onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const { save: saveAgency } = useDatabase<Agency>({ table: 'agencies' });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0: Welcome
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerTitle, setOwnerTitle] = useState('');

  // Step 1: Address
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 2: Agency
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
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
      let homebaseLat: number | undefined;
      let homebaseLng: number | undefined;

      if (fullAddress) {
        try {
          const coords = await geocodeAddress(fullAddress);
          if (coords) { homebaseLat = coords.lat; homebaseLng = coords.lng; }
        } catch (err) {
          logger.error('Geocoding failed during onboarding:', err);
        }
      }

      const profileData: Record<string, unknown> = {
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
        onboardingCompleted: true,
      };
      if (homebaseLat !== undefined) profileData.homebaseLat = homebaseLat;
      if (homebaseLng !== undefined) profileData.homebaseLng = homebaseLng;

      await saveSystemConfig(user.uid, profileData);

      // Create first agency if name provided
      if (agencyName.trim()) {
        const newAgency: Agency = {
          id: crypto.randomUUID(),
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
          prepChecklistItems: JSON.stringify([
            'Review previous inspection report',
            'Check organic system plan updates',
            'Verify input materials',
            'Review complaint history',
            'Prepare inspection forms',
            'Confirm appointment',
            'Map route',
            'Charge device',
          ]),
          reportChecklistEnabled: true,
          reportChecklistItems: JSON.stringify([
            'Review organic system plan',
            'Verify buffer zones',
            'Check input materials',
            'Inspect storage areas',
            'Review records & documentation',
            'Photograph key areas',
            'Complete field observations',
            'Verify pest management plan',
            'Check water sources',
            'Sign off with operator',
          ]),
          defaultLineItems: '[]',
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await saveAgency(newAgency);
      }

      localStorage.setItem('dios_onboarding_completed', 'true');
      Swal.fire({ text: 'Setup complete!', icon: 'success', timer: 1500, showConfirmButton: false });
      onComplete();
    } catch (error) {
      logger.error('Onboarding save failed:', error);
      Swal.fire({ text: 'Failed to save profile. Please try again or check your connection.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = 'w-full luxury-input rounded-2xl px-4 py-3 text-sm font-body outline-none';
  const labelClass = 'block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2 font-body';

  const stepTitle = (() => {
    if (step === 0) return { main: 'Welcome to', sub: 'DIOS Studio' };
    if (step === 1) return { main: 'Your business', sub: 'address' };
    if (step === 2) return { main: 'First certifying', sub: 'agency' };
    return { main: 'You\'re all', sub: 'set!' };
  })();

  const stepDescription = (() => {
    if (step === 0) return 'Let\'s set up your business profile. You can update everything later in Settings.';
    if (step === 1) return 'This sets your homebase for distance and mileage calculations to each operator.';
    if (step === 2) return 'Add the first certifying agency you work with. You can add more in Settings.';
    return 'Your business profile is ready. Click Get Started to save and open the app.';
  })();

  return (
    <div className="fixed inset-0 z-50 luxury-modal-backdrop flex items-center justify-center p-4 sm:p-6 font-body">
      <div className="luxury-card rounded-[40px] w-full max-w-[840px] overflow-hidden grid grid-cols-1 md:grid-cols-[260px_1fr] max-h-[92vh]">

        {/* Brand sidebar */}
        <div className="luxury-sidebar px-8 py-12 flex flex-col items-center text-center border-r border-white/30">
          <div className="luxury-logo-orb w-16 h-16 rounded-full flex items-center justify-center mb-6 relative z-10">
            <LeafLogo size={28} fill="white" className="drop-shadow-md" />
          </div>
          <div className="relative z-10">
            <h1 className="font-serif-display text-3xl font-semibold text-white tracking-wide" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              DIOS
            </h1>
            <span className="text-[10px] tracking-[0.25em] uppercase text-white/85 font-semibold">
              Business Setup
            </span>
          </div>
          <div className="mt-auto relative z-10 hidden md:block">
            <ProgressRing current={step + 1} total={STEPS.length} />
          </div>
        </div>

        {/* Content */}
        <div className="luxury-content relative flex flex-col overflow-hidden">
          <div className="px-10 pt-10 pb-4 shrink-0">
            <h2 className="font-serif-display text-[36px] font-semibold text-[#2a2420] leading-tight tracking-tight mb-2">
              {stepTitle.main}<br />{stepTitle.sub}
            </h2>
            <p className="text-[15px] text-[#8b7355] leading-relaxed font-medium max-w-[90%]">
              {stepDescription}
            </p>
          </div>

          <div className="px-10 pb-6 overflow-y-auto flex-1">
            {step === 0 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div>
                  <label className={labelClass}>Business Name</label>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} placeholder="My Inspection Co." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Your Name</label>
                    <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className={labelClass}>Title</label>
                    <input value={ownerTitle} onChange={(e) => setOwnerTitle(e.target.value)} className={inputClass} placeholder="Organic Inspector" />
                  </div>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5 animate-in fade-in duration-300">
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
              <div className="space-y-5 animate-in fade-in duration-300">
                <div>
                  <label className={labelClass}>Agency Name</label>
                  <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className={inputClass} placeholder="e.g., MCIA, CCOF, Oregon Tilth" />
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

            {step === 3 && (
              <div className="flex flex-col items-center justify-center py-8 animate-in fade-in duration-300">
                <div className="luxury-check-orb checked w-16 h-16 rounded-full flex items-center justify-center mb-5">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="text-sm text-[#7a6b5a] max-w-sm mx-auto text-center font-medium leading-relaxed">
                  Click <strong>Get Started</strong> to save and open the app. You can update everything in <strong>Settings</strong> at any time.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-10 py-5 flex justify-between items-center shrink-0" style={{
            borderTop: '1px solid rgba(212, 165, 116, 0.15)',
            background: 'linear-gradient(135deg, rgba(250,248,245,0.5) 0%, rgba(255,255,255,0.5) 100%)',
          }}>
            <div>
              {step > 0 && step < 3 && (
                <button onClick={handleBack} className="luxury-btn-secondary flex items-center gap-1.5 text-sm font-semibold text-[#7a6b5a] px-3 py-2 rounded-xl">
                  <ArrowLeft size={16} /> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {step > 0 && step < 3 && (
                <button
                  onClick={handleNext}
                  className="text-sm text-[#a89b8c] hover:text-[#7a6b5a] transition-colors font-medium px-3 py-2"
                >
                  Skip
                </button>
              )}
              {step < 3 ? (
                <button
                  onClick={handleNext}
                  className="luxury-btn text-white px-8 py-4 rounded-2xl text-[15px] font-bold tracking-wide flex items-center gap-3 border-0 cursor-pointer"
                >
                  Next <ArrowRight size={18} strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="luxury-btn text-white px-8 py-4 rounded-2xl text-[15px] font-bold tracking-wide flex items-center gap-3 border-0 cursor-pointer"
                >
                  {saving ? (
                    <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Get Started
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
