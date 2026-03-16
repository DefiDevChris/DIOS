import { logger } from '@dios/shared';

/**
 * Calculates one-way driving distance and duration between two coordinates
 * using the OSRM public routing API. Returns null on failure.
 */
export async function calculateDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ miles: number; minutes: number } | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}?overview=false`;

    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) {
      return null;
    }

    const { distance, duration } = data.routes[0];

    return {
      miles: distance * 0.000621371,
      minutes: duration / 60,
    };
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
