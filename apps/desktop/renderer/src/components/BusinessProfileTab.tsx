import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { geocodeAddress } from '../utils/geocodingUtils';
import { getSystemConfig, saveSystemConfig } from '../utils/systemConfig';
import { logger } from '@dios/shared';
import { Save } from 'lucide-react';
import Swal from 'sweetalert2';
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
};

const INPUT_CLASSES =
  'w-full luxury-input rounded-2xl px-4 py-3 text-sm outline-none';

const LABEL_CLASSES = 'block text-xs font-bold text-[#8b7355] uppercase tracking-wider mb-2';

export default function BusinessProfileTab() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    getSystemConfig(user.uid).then((data) => {
      setProfile({
        businessName: (data.businessName as string) ?? '',
        ownerName: (data.ownerName as string) ?? '',
        ownerTitle: (data.ownerTitle as string) ?? '',
        businessAddress: (data.businessAddress as string) ?? '',
        businessCity: (data.businessCity as string) ?? '',
        businessState: (data.businessState as string) ?? '',
        businessZip: (data.businessZip as string) ?? '',
        businessPhone: (data.businessPhone as string) ?? '',
        businessEmail: (data.businessEmail as string) ?? '',
        irsMileageRate: (data.irsMileageRate as number) ?? 0.70,
        homebaseLat: data.homebaseLat as number | undefined,
        homebaseLng: data.homebaseLng as number | undefined,
      });
    }).catch((err) => logger.error('Failed to load business profile:', err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setProfile((prev) => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
  }, []);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const fullAddress = [profile.businessAddress, profile.businessCity, profile.businessState, profile.businessZip]
        .filter(Boolean).join(', ');

      let coords: { lat: number; lng: number } | null = null;
      if (fullAddress.trim()) coords = await geocodeAddress(fullAddress);

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
      };
      if (coords) { dataToSave.homebaseLat = coords.lat; dataToSave.homebaseLng = coords.lng; }

      await saveSystemConfig(user.uid, dataToSave);

      if (coords) {
        setProfile((prev) => ({
          ...prev,
          homebaseLat: coords.lat,
          homebaseLng: coords.lng,
        }));
      }

      Swal.fire({ text: 'Business profile saved.', icon: 'success', timer: 2000, showConfirmButton: false });
    } catch (error) {
      logger.error('Failed to save business profile:', error);
      Swal.fire({ text: 'Failed to save business profile.', icon: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-[#8b7355]">Loading business profile...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#2a2420] mb-4">Business Information</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASSES}>Business Name</label>
              <input type="text" name="businessName" value={profile.businessName} onChange={handleChange} className={INPUT_CLASSES} placeholder="e.g., Acme Organic Inspections" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Owner Name</label>
              <input type="text" name="ownerName" value={profile.ownerName} onChange={handleChange} className={INPUT_CLASSES} placeholder="e.g., Jane Smith" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Title</label>
              <input type="text" name="ownerTitle" value={profile.ownerTitle} onChange={handleChange} className={INPUT_CLASSES} placeholder="e.g., Lead Inspector" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASSES}>Address</label>
              <input type="text" name="businessAddress" value={profile.businessAddress} onChange={handleChange} className={INPUT_CLASSES} placeholder="123 Main St" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>City</label>
              <input type="text" name="businessCity" value={profile.businessCity} onChange={handleChange} className={INPUT_CLASSES} placeholder="Springfield" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={LABEL_CLASSES}>State</label>
              <input type="text" name="businessState" value={profile.businessState} onChange={handleChange} className={INPUT_CLASSES} placeholder="IL" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>ZIP</label>
              <input type="text" name="businessZip" value={profile.businessZip} onChange={handleChange} className={INPUT_CLASSES} placeholder="62704" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>Phone</label>
              <input type="text" name="businessPhone" value={profile.businessPhone} onChange={handleChange} className={INPUT_CLASSES} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL_CLASSES}>Email</label>
              <input type="email" name="businessEmail" value={profile.businessEmail} onChange={handleChange} className={INPUT_CLASSES} placeholder="contact@example.com" />
            </div>
            <div>
              <label className={LABEL_CLASSES}>IRS Mileage Rate ($/mi)</label>
              <input type="number" name="irsMileageRate" value={profile.irsMileageRate} onChange={handleChange} min="0" step="0.01" className={INPUT_CLASSES} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-[rgba(212,165,116,0.12)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="luxury-btn text-white px-6 py-2.5 rounded-xl text-sm font-bold border-0 cursor-pointer transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
