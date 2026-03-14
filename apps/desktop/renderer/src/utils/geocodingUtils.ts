import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@dios/shared/firebase';
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
 * Geocodes a single operation's address and saves the resulting coordinates
 * to Firestore. Designed to be called fire-and-forget in the background
 * when an Operation is created or updated.
 */
export async function geocodeAndSaveOperation(
  userId: string,
  operationId: string,
  address: string
): Promise<void> {
  if (!db) return;

  const coords = await geocodeAddress(address);
  if (coords) {
    try {
      await updateDoc(doc(db, `users/${userId}/operations/${operationId}`), {
        lat: coords.lat,
        lng: coords.lng,
      });
    } catch (error) {
      logger.error(`Failed to save coordinates for operation ${operationId}:`, error);
    }
  }
}

/**
 * Processes a list of operations that are missing lat/lng coordinates,
 * geocoding each one and persisting the results to Firestore.
 * Returns an array of updated coordinate records.
 * Intended for batch processing (e.g., on the Routing page load).
 */
export async function geocodeMissingOperations(
  userId: string,
  operations: Array<{ id: string; address?: string; lat?: number; lng?: number }>
): Promise<Array<{ id: string; lat: number; lng: number }>> {
  const results: Array<{ id: string; lat: number; lng: number }> = [];

  for (const op of operations) {
    if (op.address && (op.lat === undefined || op.lng === undefined)) {
      const coords = await geocodeAddress(op.address);
      if (coords && db) {
        results.push({ id: op.id, ...coords });
        try {
          await updateDoc(doc(db, `users/${userId}/operations/${op.id}`), {
            lat: coords.lat,
            lng: coords.lng,
          });
        } catch (error) {
          logger.error(`Failed to save coordinates for operation ${op.id}:`, error);
        }
        // Small delay to avoid hitting geocoding rate limits
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  return results;
}
