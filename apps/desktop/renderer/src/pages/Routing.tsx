import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { configStore } from '@dios/shared';
import { useDatabase } from '../hooks/useDatabase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { Map, MapPin, Truck, Save, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { geocodeMissingOperations } from '../utils/geocodingUtils';
import Swal from 'sweetalert2';
import type { Operation, Inspection } from '@dios/shared';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.8283,
  lng: -98.5795
};

export default function Routing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { findAll: findAllOperations, save: saveOperation } = useDatabase<Operation>({ table: 'operations' });
  const { save: saveInspection } = useDatabase<Inspection>({ table: 'inspections' });
  
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  // Trip Bundling State
  const [selectedOpIds, setSelectedOpIds] = useState<Set<string>>(new Set());
  const [originAddress, setOriginAddress] = useState('');
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [tripDate, setTripDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  const [apiKeyChecked, setApiKeyChecked] = useState(false);

  useEffect(() => {
    const config = configStore.getConfig();
    const key = config?.googleMapsApiKey;
    if (key && key !== 'dummy') {
      setApiKey(key);
    }
    setApiKeyChecked(true);
  }, []);

  // Resolve the key once so useJsApiLoader always sees the same value
  const resolvedKey = apiKey && apiKey !== 'dummy' ? apiKey : '';

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: resolvedKey,
    libraries: ['places']
  });

  if (!apiKeyChecked) {
    return null;
  }

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-stone-500">
        <AlertCircle size={48} className="text-stone-300 mb-4" />
        <h2 className="text-xl font-bold text-stone-900 mb-2">Google Maps Not Configured</h2>
        <p className="max-w-md text-center">Please add your Google Maps API key in the Settings page to use the routing dashboard.</p>
        <button
          onClick={() => navigate('/settings')}
          className="mt-6 bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Go to Settings
        </button>
      </div>
    );
  }

  if (loadError) {
    return <div className="p-8 text-center text-red-500">Error loading Google Maps</div>;
  }

  useEffect(() => {
    if (!user) return;

    const fetchOperations = async () => {
      try {
        const opsData = await findAllOperations();
        setOperations(opsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/operations`);
      }
    };

    fetchOperations();
  }, [user, findAllOperations]);

  // Geocode operations missing lat/lng — runs in the background via the shared utility
  useEffect(() => {
    if (!isLoaded || operations.length === 0 || geocoding || !user) return;

    const runGeocoding = async () => {
      setGeocoding(true);
      const updates = await geocodeMissingOperations(user.uid, operations);
      if (updates.length > 0) {
        setOperations(prev =>
          prev.map(op => {
            const updated = updates.find(u => u.id === op.id);
            return updated ? { ...op, lat: updated.lat, lng: updated.lng } : op;
          })
        );
      }
      setGeocoding(false);
    };

    runGeocoding();
  }, [isLoaded, operations.length, user]);

  const toggleOperationSelection = (opId: string) => {
    const newSelected = new Set(selectedOpIds);
    if (newSelected.has(opId)) {
      newSelected.delete(opId);
    } else {
      newSelected.add(opId);
    }
    setSelectedOpIds(newSelected);
  };

  const saveBundle = async () => {
    if (!user || !directionsResult) return;

    setIsSaving(true);
    try {
      // Calculate total duration and distance
      let totalDurationSeconds = 0;
      let totalDistanceMeters = 0;

      const legs = directionsResult.routes[0].legs;
      legs.forEach(leg => {
        totalDurationSeconds += leg.duration?.value || 0;
        totalDistanceMeters += leg.distance?.value || 0;
      });

      // Convert to hours and miles
      const totalHours = totalDurationSeconds / 3600;
      const totalMiles = totalDistanceMeters * 0.000621371;

      const stops = selectedOpIds.size;
      const distributedMiles = totalMiles / stops;

      const bundleId = `bundle_${Date.now()}`;

      const selectedOps = operations.filter(op => selectedOpIds.has(op.id));

      // Create inspections for selected operations using useDatabase save
      await Promise.all(selectedOps.map(async (op) => {
        const newId = crypto.randomUUID();
        const inspection: Inspection = {
          id: newId,
          operationId: op.id,
          date: tripDate,
          status: 'Scheduled',
          isBundled: true,
          bundleId: bundleId,
          totalTripDriveTime: totalHours,
          totalTripStops: stops,
          milesDriven: Math.round(distributedMiles),
          calculatedMileage: Math.round(distributedMiles),
          calculatedDriveTime: 0,
          baseHoursLog: 0,
          additionalHoursLog: 0,
          mealsAndExpenses: 0,
          perDiemDays: 0,
          customLineItemAmount: 0,
          prepHours: 0,
          onsiteHours: 0,
          reportHours: 0,
          prepChecklistData: '[]',
          reportChecklistData: '[]',
          updatedAt: new Date().toISOString(),
          syncStatus: 'pending',
        };
        await saveInspection(inspection);
      }));

      Swal.fire({ text: "Bundle saved successfully! Linked inspections created.", icon: 'success' });
      navigate('/schedule');
    } catch (error) {
      logger.error("Error saving bundle", error);
      Swal.fire({ text: "Failed to save bundle.", icon: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const calculateRoute = async () => {
    if (!originAddress) {
      Swal.fire({ text: "Please enter a starting address.", icon: 'info' });
      return;
    }
    if (selectedOpIds.size === 0) {
      Swal.fire({ text: "Please select at least one operation to visit.", icon: 'info' });
      return;
    }

    // Verify Google Maps API is loaded before using DirectionsService
    if (!window.google?.maps?.DirectionsService) {
      Swal.fire({ text: "Google Maps API is not yet loaded. Please wait a moment and try again.", icon: 'warning' });
      logger.error('DirectionsService called before Google Maps API loaded');
      return;
    }

    setIsCalculating(true);
    const directionsService = new window.google.maps.DirectionsService();

    const selectedOps = operations.filter(op => selectedOpIds.has(op.id));

    // Extract waypoints (all selected operations)
    const waypoints = selectedOps.map(op => ({
      location: op.address,
      stopover: true
    }));

    try {
      const response = await directionsService.route({
        origin: originAddress,
        destination: originAddress, // Round trip
        waypoints: waypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
      });

      setDirectionsResult(response);
    } catch (error) {
      logger.error("Directions request failed", error);
      Swal.fire({ text: "Failed to calculate route. Please ensure all addresses are valid.", icon: 'error' });
    } finally {
      setIsCalculating(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-[#D49A6A]" size={32} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] -m-4 sm:-m-8 bg-stone-50 flex flex-col md:flex-row overflow-hidden border-t border-stone-200">
      {/* Sidebar Placeholder */}
      <div className="w-full md:w-96 bg-white border-r border-stone-200 flex flex-col z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] shrink-0 overflow-y-auto">
        <div className="p-6 border-b border-stone-100 bg-stone-50/50 sticky top-0 z-10 backdrop-blur-xl">
          <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight flex items-center gap-2">
            <Map className="text-[#D49A6A]" />
            Route Planning
          </h1>
          <p className="text-sm text-stone-500 mt-1">Select operations to build a trip bundle.</p>
        </div>
        <div className="p-6 flex-1 flex flex-col min-h-0">
          <div className="space-y-4 mb-6 shrink-0">
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Trip Date</label>
              <input
                type="date"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Start / End Location (Origin)</label>
              <input
                type="text"
                value={originAddress}
                onChange={(e) => setOriginAddress(e.target.value)}
                placeholder="e.g., 123 Main St, City, ST"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all"
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 shrink-0">Operations to Visit</label>
            <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl bg-stone-50/50">
              {operations.length === 0 ? (
                <div className="p-4 text-center text-sm text-stone-500">No operations found.</div>
              ) : (
                <div className="divide-y divide-stone-100">
                  {operations.map(op => (
                    <label key={op.id} className="flex items-start gap-3 p-3 hover:bg-white cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedOpIds.has(op.id)}
                        onChange={() => toggleOperationSelection(op.id)}
                        className="mt-1 w-4 h-4 text-[#D49A6A] rounded border-stone-300 focus:ring-[#D49A6A]"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-stone-900 text-sm truncate">{op.name}</div>
                        <div className="text-xs text-stone-500 truncate">{op.address}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3 shrink-0">
            <button
              onClick={calculateRoute}
              disabled={isCalculating || operations.length === 0}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isCalculating ? <Loader2 className="animate-spin" size={18} /> : <MapPin size={18} />}
              Calculate Optimal Route
            </button>

            {directionsResult && (
              <div className="pt-4 border-t border-stone-200">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <div className="text-xs text-stone-500 font-bold uppercase tracking-wider mb-1">Total Distance</div>
                    <div className="text-lg font-bold text-stone-900">
                      {Math.round(directionsResult.routes[0].legs.reduce((acc, leg) => acc + (leg.distance?.value || 0), 0) * 0.000621371)} mi
                    </div>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                    <div className="text-xs text-stone-500 font-bold uppercase tracking-wider mb-1">Total Time</div>
                    <div className="text-lg font-bold text-stone-900">
                      {Math.round(directionsResult.routes[0].legs.reduce((acc, leg) => acc + (leg.duration?.value || 0), 0) / 3600 * 10) / 10} hrs
                    </div>
                  </div>
                </div>

                <button
                  onClick={saveBundle}
                  disabled={isSaving}
                  className="w-full bg-[#D49A6A] hover:bg-[#c28a5c] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  Save Trip Bundle
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative bg-stone-100">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={operations.length > 0 && operations[0].lat && operations[0].lng
            ? { lat: operations[0].lat, lng: operations[0].lng }
            : defaultCenter}
          zoom={operations.length > 0 ? 8 : 4}
          options={{
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
              }
            ]
          }}
        >
          {directionsResult && (
            <DirectionsRenderer
              directions={directionsResult}
              options={{
                suppressMarkers: false,
                polylineOptions: {
                  strokeColor: '#D49A6A',
                  strokeWeight: 5,
                  strokeOpacity: 0.8
                }
              }}
            />
          )}

          {!directionsResult && operations.map(op => {
            if (op.lat && op.lng) {
              return (
                <Marker
                  key={op.id}
                  position={{ lat: op.lat, lng: op.lng }}
                  title={op.name}
                />
              );
            }
            return null;
          })}
        </GoogleMap>
      </div>
    </div>
  );
}
