import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { configStore } from '../lib/configStore';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { Map, MapPin, Truck, Save, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.8283,
  lng: -98.5795
};

interface Operation {
  id: string;
  name: string;
  address: string;
  contactName: string;
  phone: string;
  email: string;
  agencyId: string;
  status: 'active' | 'inactive';
  notes: string;
  lat?: number;
  lng?: number;
}

export default function Routing() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    const config = configStore.getConfig();
    if (config?.googleMapsApiKey) {
      setApiKey(config.googleMapsApiKey);
    }
  }, []);

  // Use the google-maps loader
  // We only load if apiKey exists to avoid console warnings, or fallback to an empty string.
  // Although Google Maps still warns if empty string is passed, we check `!apiKey` before rendering map
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    libraries: ['places']
  });

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
        const querySnapshot = await getDocs(collection(db, `users/${user.uid}/operations`));
        const opsData: Operation[] = [];
        querySnapshot.forEach((doc) => {
          opsData.push({ id: doc.id, ...doc.data() } as Operation);
        });
        setOperations(opsData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/operations`);
      }
    };

    fetchOperations();
  }, [user]);

  // Geocode operations missing lat/lng
  useEffect(() => {
    if (!isLoaded || operations.length === 0 || geocoding || !user) return;

    const geocodeMissing = async () => {
      setGeocoding(true);
      const geocoder = new window.google.maps.Geocoder();
      let hasUpdates = false;
      const updatedOps = [...operations];

      for (let i = 0; i < updatedOps.length; i++) {
        const op = updatedOps[i];
        if (op.address && (op.lat === undefined || op.lng === undefined)) {
          try {
            const response = await geocoder.geocode({ address: op.address });
            if (response.results && response.results[0]) {
              const location = response.results[0].geometry.location;
              op.lat = location.lat();
              op.lng = location.lng();

              // Save to Firestore
              await updateDoc(doc(db, `users/${user.uid}/operations/${op.id}`), {
                lat: op.lat,
                lng: op.lng
              });
              hasUpdates = true;
            }
          } catch (error) {
            console.error(`Geocoding error for ${op.address}:`, error);
          }
          // Add a small delay to avoid hitting rate limits too quickly
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      if (hasUpdates) {
        setOperations(updatedOps);
      }
      setGeocoding(false);
    };

    geocodeMissing();
  }, [isLoaded, operations, geocoding, user]);

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

      for (const op of selectedOps) {
        const newDocRef = doc(collection(db, `users/${user.uid}/inspections`));
        await setDoc(newDocRef, {
          operationId: op.id,
          date: tripDate,
          status: 'Scheduled',
          isBundled: true,
          bundleId: bundleId,
          totalTripDriveTime: totalHours,
          totalTripStops: stops,
          milesDriven: Math.round(distributedMiles), // Or keep as float if preferred
          baseHoursLog: 0,
          additionalHoursLog: 0,
          mealsAndExpenses: 0,
          perDiemDays: 0,
          customLineItemAmount: 0
        });
      }

      alert("Bundle saved successfully! Linked inspections created.");
      navigate('/schedule');
    } catch (error) {
      console.error("Error saving bundle", error);
      alert("Failed to save bundle.");
    } finally {
      setIsSaving(false);
    }
  };

  const calculateRoute = async () => {
    if (!originAddress) {
      alert("Please enter a starting address.");
      return;
    }
    if (selectedOpIds.size === 0) {
      alert("Please select at least one operation to visit.");
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
      console.error("Directions request failed", error);
      alert("Failed to calculate route. Please ensure all addresses are valid.");
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
