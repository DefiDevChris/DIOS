import { logger } from '@dios/shared';

export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Geocodes an address using the Nominatim (OpenStreetMap) API.
 * No API key required. Respects Nominatim usage policy with a
 * descriptive User-Agent header.
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address.trim()) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DIOS-Studio/1.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      return { lat: parseFloat(result.lat), lng: parseFloat(result.lon) };
    }
  } catch (error) {
    logger.error(`Geocoding error for address "${address}":`, error);
  }

  return null;
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
      }
      // Nominatim rate limit: max 1 request per second (always delay, not just on success)
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
  }

  return results;
}
