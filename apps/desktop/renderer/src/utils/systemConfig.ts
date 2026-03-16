/**
 * Utility for reading/writing the system_settings/config document.
 * In Electron, routes through the IPC system_config table (key-value store).
 * In web/Firestore mode, reads/writes the Firestore document directly.
 */
import { db } from '@dios/shared/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { isElectron } from './isElectron';
import { logger } from '@dios/shared';

export async function getSystemConfig(userId: string): Promise<Record<string, unknown>> {
  if (isElectron() && window.electronAPI?.db) {
    try {
      const rows = await window.electronAPI.db.findAll('system_config') as Array<{ key: string; value: string }>;
      const result: Record<string, unknown> = {};
      for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
      }
      return result;
    } catch (error) {
      logger.error('Failed to load system_config from SQLite:', error);
      return {};
    }
  }

  if (!db) return {};
  try {
    const snap = await getDoc(doc(db, `users/${userId}/system_settings/config`));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  } catch (error) {
    logger.error('Failed to load system_settings/config from Firestore:', error);
    return {};
  }
}

export async function saveSystemConfig(userId: string, data: Record<string, unknown>): Promise<void> {
  if (isElectron() && window.electronAPI?.db) {
    try {
      for (const [key, value] of Object.entries(data)) {
        // system_config uses key/value/updatedAt — no id or syncStatus columns
        await window.electronAPI.db.upsert('system_config', {
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value ?? ''),
          updatedAt: new Date().toISOString(),
        });
      }
      return;
    } catch (error) {
      logger.error('Failed to save system_config to SQLite:', error);
      throw error;
    }
  }

  if (!db) throw new Error('Firestore not initialized');
  // Firestore rejects undefined field values — strip them before writing
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  );
  await setDoc(doc(db, `users/${userId}/system_settings/config`), cleanData, { merge: true });
}
