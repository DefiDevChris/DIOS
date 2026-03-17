import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { syncInspectionRow } from './sheetsSync';
import { logger } from '@dios/shared';

// --- Types ---

export interface SheetQueueItem {
  id: string;
  inspectionId: string;
  rowData: string[];
  spreadsheetId: string;
  status: 'pending' | 'retrying' | 'failed';
  retryCount: number;
  lastError?: string;
  createdAt: number;
  lastAttemptAt?: number;
}

interface SheetsSyncDB extends DBSchema {
  queue: {
    key: string;
    value: SheetQueueItem;
    indexes: {
      'by-status': SheetQueueItem['status'];
      'by-inspectionId': string;
    };
  };
}

const MAX_RETRIES = 5;

let dbPromise: Promise<IDBPDatabase<SheetsSyncDB>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<SheetsSyncDB>('dios-sheets-queue', 1, {
      upgrade(db) {
        const store = db.createObjectStore('queue', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
        store.createIndex('by-inspectionId', 'inspectionId');
      },
    });
  }
  return dbPromise;
};

// --- Public API ---

/**
 * Queue a sheet write for an inspection row.
 * If a pending item already exists for the same inspectionId, the rowData is
 * coalesced into the existing entry instead of creating a duplicate.
 */
export const queueSheetWrite = async (
  inspectionId: string,
  rowData: string[],
  spreadsheetId: string
): Promise<string> => {
  try {
    const db = await initDB();

    // Coalesce: reuse an existing pending item for the same inspection
    const allForInspection = await db.getAllFromIndex('queue', 'by-inspectionId', inspectionId);
    const existing = allForInspection.find((item) => item.status === 'pending');

    if (existing) {
      await db.put('queue', {
        ...existing,
        rowData,
        spreadsheetId,
      });
      return existing.id;
    }

    const id = crypto.randomUUID();
    await db.put('queue', {
      id,
      inspectionId,
      rowData,
      spreadsheetId,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    });
    return id;
  } catch (error) {
    logger.error(`[SheetQueue] Failed to queue write for inspection "${inspectionId}":`, error);
    throw error;
  }
};

/**
 * Process all pending and retrying items in the queue.
 * Each item is attempted independently so one failure does not block others.
 */
export const processSheetQueue = async (): Promise<void> => {
  const db = await initDB();
  const all = await db.getAll('queue');

  const eligible = all.filter(
    (item) => item.status === 'pending' || item.status === 'retrying'
  );

  for (const item of eligible) {
    try {
      await syncInspectionRow(item.spreadsheetId, item.inspectionId, item.rowData);
      await db.delete('queue', item.id);
    } catch (error) {
      const nextRetry = item.retryCount + 1;
      const nextStatus = nextRetry >= MAX_RETRIES ? 'failed' : 'retrying';

      await db.put('queue', {
        ...item,
        retryCount: nextRetry,
        status: nextStatus,
        lastError: error instanceof Error ? error.message : String(error),
        lastAttemptAt: Date.now(),
      });
    }
  }
};

/** Return count of items still eligible for processing. */
export const getSheetQueueSize = async (): Promise<number> => {
  const db = await initDB();
  const all = await db.getAll('queue');
  return all.filter(
    (item) => item.status === 'pending' || item.status === 'retrying'
  ).length;
};

/** Delete all items from the queue. */
export const clearSheetQueue = async (): Promise<void> => {
  const db = await initDB();
  await db.clear('queue');
};
