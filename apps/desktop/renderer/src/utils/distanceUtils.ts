import { logger } from '@dios/shared';

export interface DistanceResult {
  distanceMiles: number;
  durationMinutes: number;
}

/**
 * Calculates the round-trip driving distance and duration between two
 * coordinates using the Google Maps Directions API.
 * Returns null if the request fails or no route is found.
 */
export async function calculateDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<DistanceResult | null> {
  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${originLat},${originLng}` +
      `&destination=${destLat},${destLng}` +
      `&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]?.legs?.[0]) {
      return null;
    }

    const leg = data.routes[0].legs[0];
    const distanceMeters = leg.distance.value;
    const durationSeconds = leg.duration.value;

    // Convert to miles and minutes, then multiply by 2 for round trip
    const distanceMiles = (distanceMeters / 1609.344) * 2;
    const durationMinutes = (durationSeconds / 60) * 2;

    return { distanceMiles, durationMinutes };
  } catch (error) {
    logger.error('Distance calculation error:', error);
    return null;
  }
}

/**
 * Formats a distance in miles for display (e.g. "12.3 mi").
 */
export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

/**
 * Formats a duration in minutes for display.
 * Returns "X hrs Y min", "X hrs", or "Y min" as appropriate.
 */
export function formatDriveTime(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hrs === 0) {
    return `${mins} min`;
  }

  if (mins === 0) {
    return `${hrs} hrs`;
  }

  return `${hrs} hrs ${mins} min`;
}
