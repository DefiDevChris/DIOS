import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { geocodeAddress } from '../utils/geocodingUtils';
// Note: system_settings/config is a special document path, keeping raw Firestore for this
import { logger } from '@dios/shared';
import { Save } from 'lucide-react';
import Swal from 'sweetalert2';
import SignatureEditor from './SignatureEditor';

interface BusinessProfile {
  businessName: string;
  ownerName: string;
  ownerTitle: string;
  businessAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  businessPhone: string;
  businessEmail: string;
  irsMileageRate: number;
  emailSignatureHtml: string;
  homebaseLat?: number;
  homebaseLng?: number;
}

const DEFAULT_PROFILE: BusinessProfile = {
  businessName: '',
  ownerName: '',
  ownerTitle: '',
  businessAddress: '',
  businessCity: '',
  businessState: '',
  businessZip: '',
  businessPhone: '',
  businessEmail: '',
  irsMileageRate: 0.70,
  emailSignatureHtml: '',
};

function buildDefaultSignature(profile: BusinessProfile): string {
  const parts: string[] = [];

  if (profile.ownerName) {
    parts.push(`<b>${profile.ownerName}</b>`);
  }
  if (profile.ownerTitle) {
    parts.push(profile.ownerTitle);
  }
  if (profile.businessName) {
    parts.push(profile.businessName);
  }
  if (profile.businessPhone) {
    parts.push(profile.businessPhone);
  }
  if (profile.businessEmail) {
    parts.push(`<a href="mailto:${profile.businessEmail}">${profile.businessEmail}</a>`);
  }

  return parts.join('<br/>');
}

const INPUT_CLASSES =
  'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-colors outline-none';

const LABEL_CLASSES = 'block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2';

export default function BusinessProfileTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const configDocPath = user ? `users/${user.uid}/system_settings/config` : null;

  useEffect(() => {
    if (!configDocPath || !db) {
      setLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        const snapshot = await getDoc(doc(db, configDocPath));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setProfile({
            businessName: data.businessName ?? '',
            ownerName: data.ownerName ?? '',
            ownerTitle: data.ownerTitle ?? '',
            businessAddress: data.businessAddress ?? '',
            businessCity: data.businessCity ?? '',
            businessState: data.businessState ?? '',
            businessZip: data.businessZip ?? '',
            businessPhone: data.businessPhone ?? '',
            businessEmail: data.businessEmail ?? '',
            irsMileageRate: data.irsMileageRate ?? 0.70,
            emailSignatureHtml: data.emailSignatureHtml ?? '',
            homebaseLat: data.homebaseLat,
            homebaseLng: data.homebaseLng,
          });
        }
      } catch (error) {
        logger.error('Failed to load business profile:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [configDocPath]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value, type } = e.target;
      setProfile((prev) => ({
        ...prev,
        [name]: type === 'number' ? parseFloat(value) || 0 : value,
      }));
    },
    []
  );

  const handleSignatureChange = useCallback((html: string) => {
    setProfile((prev) => ({ ...prev, emailSignatureHtml: html }));
  }, []);

  const handleSave = async () => {
    if (!configDocPath || !db || !user) return;

    setSaving(true);

    try {
      const fullAddress = [
        profile.businessAddress,
        profile.businessCity,
        profile.businessState,
        profile.businessZip,
      ]
        .filter(Boolean)
        .join(', ');

      let coords: { lat: number; lng: number } | null = null;
      if (fullAddress.trim()) {
        coords = await geocodeAddress(fullAddress);
      }

      const signatureHtml =
        profile.emailSignatureHtml.trim() || buildDefaultSignature(profile);

      const dataToSave: Record<string, unknown> = {
        businessName: profile.businessName,
        ownerName: profile.ownerName,
        ownerTitle: profile.ownerTitle,
        businessAddress: profile.businessAddress,
        businessCity: profile.businessCity,
        businessState: profile.businessState,
        businessZip: profile.businessZip,
        businessPhone: profile.businessPhone,
        businessEmail: profile.businessEmail,
        irsMileageRate: profile.irsMileageRate,
        emailSignatureHtml: signatureHtml,
      };

      if (coords) {
        dataToSave.homebaseLat = coords.lat;
        dataToSave.homebaseLng = coords.lng;
      }

      await setDoc(doc(db, configDocPath), dataToSave, { merge: true });

      setProfile((prev) => ({
        ...prev,
        emailSignatureHtml: signatureHtml,
        ...(coords ? { homebaseLat: coords.lat, homebaseLng: coords.lng } : {}),
      }));

      Swal.fire({
        text: 'Business profile saved successfully.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      logger.error('Failed to save business profile:', error);
      Swal.fire({
        text: 'Failed to save business profile. Please try again.',
        icon: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-stone-500">
        Loading business profile...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Business Information */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 mb-4">
          Business Information
        </h3>

        <div className="space-y-4">
          {/* Row: Business Name, Owner Name, Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASSES}>Business Name</label>
              <input
                type="text"
                name="businessName"
                value={profile.businessName}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="e.g., Acme Organic Inspections"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Owner Name</label>
              <input
                type="text"
                name="ownerName"
                value={profile.ownerName}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="e.g., Jane Smith"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Title</label>
              <input
                type="text"
                name="ownerTitle"
                value={profile.ownerTitle}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="e.g., Lead Inspector"
              />
            </div>
          </div>

          {/* Row: Address (col-span-2), City */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASSES}>Address</label>
              <input
                type="text"
                name="businessAddress"
                value={profile.businessAddress}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="123 Main St"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>City</label>
              <input
                type="text"
                name="businessCity"
                value={profile.businessCity}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="Springfield"
              />
            </div>
          </div>

          {/* Row: State, ZIP, Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASSES}>State</label>
              <input
                type="text"
                name="businessState"
                value={profile.businessState}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="IL"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>ZIP</label>
              <input
                type="text"
                name="businessZip"
                value={profile.businessZip}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="62704"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Phone</label>
              <input
                type="text"
                name="businessPhone"
                value={profile.businessPhone}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Row: Email (col-span-2), IRS Mileage Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASSES}>Email</label>
              <input
                type="email"
                name="businessEmail"
                value={profile.businessEmail}
                onChange={handleChange}
                className={INPUT_CLASSES}
                placeholder="contact@example.com"
              />
            </div>
            <div>
              <label className={LABEL_CLASSES}>IRS Mileage Rate ($/mi)</label>
              <input
                type="number"
                name="irsMileageRate"
                value={profile.irsMileageRate}
                onChange={handleChange}
                min="0"
                step="0.01"
                className={INPUT_CLASSES}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Email Signature */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 mb-4">
          Email Signature
        </h3>

        <SignatureEditor
          value={profile.emailSignatureHtml}
          onChange={handleSignatureChange}
        />

        {!profile.emailSignatureHtml.trim() && (
          <p className="text-xs text-stone-400 mt-2">
            Leave blank to auto-generate from your business information above.
          </p>
        )}
      </div>

      {/* Footer: Save Button */}
      <div className="flex justify-end pt-4 border-t border-stone-100">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-[#D49A6A] text-white hover:bg-[#c28a5c] px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
