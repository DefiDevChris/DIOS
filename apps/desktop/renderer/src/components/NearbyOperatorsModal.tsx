import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { X, MapPin } from 'lucide-react';
import type { Operation, Agency } from '@dios/shared';

interface NearbyOperatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentOperation: Operation;
  operations: Operation[];
  agencies: Agency[];
}

const BADGE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEstDrive(miles: number): string {
  const mins = Math.round(miles * 1.5);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `~${hrs}h ${rem}m` : `~${hrs}h`;
}

export default function NearbyOperatorsModal({
  isOpen,
  onClose,
  currentOperation,
  operations,
  agencies,
}: NearbyOperatorsModalProps) {
  const navigate = useNavigate();

  const agencyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agencies) {
      map.set(a.id, a.name);
    }
    return map;
  }, [agencies]);

  const sorted = useMemo(() => {
    if (!currentOperation.lat || !currentOperation.lng) return [];

    return operations
      .filter((op) => op.lat && op.lng && op.status === 'active')
      .map((op) => ({
        ...op,
        distance: haversineDistance(
          currentOperation.lat!,
          currentOperation.lng!,
          op.lat!,
          op.lng!
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
  }, [operations, currentOperation]);

  if (!isOpen) return null;

  const hasLocation = currentOperation.lat != null && currentOperation.lng != null;

  return (
    <div className="luxury-modal-backdrop flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="luxury-modal-card rounded-[28px] w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-[rgba(212,165,116,0.15)] flex justify-between items-center shrink-0">
          <div>
            <h2 className="font-serif-display text-xl font-semibold text-[#2a2420]">Nearby Operators</h2>
            <p className="font-body text-xs text-[#a89b8c] mt-0.5">Sorted by straight-line distance</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#a89b8c] hover:text-[#2a2420] rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {!hasLocation ? (
            <div className="p-8 text-center text-[#a89b8c] font-body text-sm">
              <MapPin size={32} className="mx-auto mb-3 text-[#d4a574]" />
              Current operation location not set. Geocode the address first.
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center text-[#a89b8c] font-body text-sm">
              No nearby operators with known locations.
            </div>
          ) : (
            sorted.map((op) => {
              const agencyName = agencyMap.get(op.agencyId) || 'Unknown';
              const colorIndex = op.agencyId.charCodeAt(0) % BADGE_COLORS.length;

              return (
                <button
                  key={op.id}
                  onClick={() => {
                    onClose();
                    navigate(`/operations/${op.id}`);
                  }}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[rgba(212,165,116,0.06)] cursor-pointer transition-colors border-b border-[rgba(212,165,116,0.15)] last:border-0 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-body font-medium text-[#2a2420] text-sm truncate">{op.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${BADGE_COLORS[colorIndex]}`}
                      >
                        {agencyName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium text-[#2a2420]">
                      {op.distance.toFixed(1)} mi
                    </div>
                    <div className="text-xs text-[#a89b8c]">{formatEstDrive(op.distance)}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
