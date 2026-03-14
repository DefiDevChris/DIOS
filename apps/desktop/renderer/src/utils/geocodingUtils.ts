import { configStore, logger } from '@dios/shared';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Geocodes an address using the Google Maps REST Geocoding API.
 * Does not require the Maps JS SDK to be loaded, making it safe to call
 * from any context (e.g., on operation save in the background).
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const apiKey = configStore.getConfig()?.googleMapsApiKey;
  if (!apiKey || !address.trim()) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
  } catch (error) {
    logger.error(`Geocoding error for address "${address}":`, error);
  }

  return null;
}

/**
 * Geocodes a single operation's address and returns the resulting coordinates.
 * Pages should call this and then use their own save function from useDatabase
 * to persist the coordinates to the database.
 * 
 * @returns Coordinates if geocoding succeeds, null otherwise
 */
export async function geocodeAndSaveOperation(
  _userId: string,
  _operationId: string,
  _address: string
): Promise<void> {
  // DEPRECATED: This function is kept for backward compatibility.
  // New code should use geocodeAddress() directly and save via useDatabase.
  logger.warn('[geocodingUtils] geocodeAndSaveOperation is deprecated. Use geocodeAddress() with useDatabase.save() instead.');
}

/**
 * Processes a list of operations that are missing lat/lng coordinates,
 * geocoding each one and returning the results.
 * 
 * NOTE: This function no longer saves to Firestore directly. The caller
 * is responsible for persisting coordinates using their save function from useDatabase.
 * 
 * @returns Array of operation IDs with their coordinates
 */
export async function geocodeMissingOperations(
  _userId: string,
  operations: Array<{ id: string; address?: string; lat?: number; lng?: number }>
): Promise<Array<{ id: string; lat: number; lng: number }>> {
  const results: Array<{ id: string; lat: number; lng: number }> = [];

  for (const op of operations) {
    if (op.address && (op.lat === undefined || op.lng === undefined)) {
      const coords = await geocodeAddress(op.address);
      if (coords) {
        results.push({ id: op.id, ...coords });
        // Small delay to avoid hitting geocoding rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  return results;
}
