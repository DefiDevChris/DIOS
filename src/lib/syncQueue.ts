import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { db as firestoreDb } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

// --- Types ---

export type QueueItemStatus = 'pending' | 'uploading' | 'failed';

export interface QueueItemMetadata {
  fileName: string;
  year: number;
  uid: string;
  /** Firestore document path to update with driveFileId after upload, e.g. "users/{uid}/expenses/{docId}" */
  firestoreDocPath?: string;
  /** Field name in Firestore to write the Drive file ID into (default: "receiptFileId") */
  firestoreField?: string;
}

interface SyncDB extends DBSchema {
  FileQueue: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      metadata: QueueItemMetadata;
      status: QueueItemStatus;
      retryCount: number;
      lastError?: string;
      createdAt: number;
      lastAttemptAt?: number;
    };
    indexes: { 'by-status': QueueItemStatus };
  };
}

export type QueueItem = SyncDB['FileQueue']['value'];

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;
const POLL_INTERVAL_MS = 30_000; // check queue every 30s when online

let dbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<SyncDB>('DOIS_Sync', 2, {
      upgrade(db, oldVersion) {
        // Drop v1 store if upgrading
        if (oldVersion < 2 && db.objectStoreNames.contains('FileQueue')) {
          db.deleteObjectStore('FileQueue');
        }
        const store = db.createObjectStore('FileQueue', { keyPath: 'id' });
        store.createIndex('by-status', 'status');
      },
    });
  }
  return dbPromise;
};

// --- Public API ---

/**
 * Add a file to the offline sync queue.
 * Optionally provide a firestoreDocPath so the queue processor can write
 * the resulting driveFileId back to Firestore after a successful upload.
 */
export const queueFile = async (
  blob: Blob,
  metadata: QueueItemMetadata
): Promise<string> => {
  const db = await initDB();
  const id = crypto.randomUUID();
  await db.put('FileQueue', {
    id,
    blob,
    metadata,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  });
  return id;
};

/** Get all items currently in the queue (for UI display). */
export const getQueueItems = async (): Promise<QueueItem[]> => {
  const db = await initDB();
  return db.getAll('FileQueue');
};

/** Get count of pending/failed items. */
export const getQueueSize = async (): Promise<number> => {
  const db = await initDB();
  return db.count('FileQueue');
};

// --- Drive helpers ---

const findOrCreateFolder = async (
  name: string,
  accessToken: string,
  parentId?: string
): Promise<string> => {
  const escapedName = name.replace(/'/g, "\\'");
  let query = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) {
    throw new Error(`Drive folder search failed: ${searchRes.status} ${await searchRes.text()}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  const createMetadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    createMetadata.parents = [parentId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createMetadata),
  });

  if (!createRes.ok) {
    throw new Error(`Drive folder creation failed: ${createRes.status} ${await createRes.text()}`);
  }

  const createData = await createRes.json();
  return createData.id;
};

/**
 * Upload a single blob to Google Drive using resumable upload.
 * Returns the Drive file ID on success.
 */
const uploadFileToDrive = async (
  blob: Blob,
  fileName: string,
  folderId: string,
  accessToken: string
): Promise<string> => {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  // Initiate resumable upload
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': blob.type || 'application/octet-stream',
        'X-Upload-Content-Length': blob.size.toString(),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    throw new Error(`Resumable upload init failed: ${initRes.status} ${await initRes.text()}`);
  }

  const locationUrl = initRes.headers.get('Location');
  if (!locationUrl) {
    throw new Error('No Location header in resumable upload response');
  }

  // Upload the actual bytes
  const uploadRes = await fetch(locationUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`File upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  return uploadData.id;
};

/**
 * After a successful upload, write the driveFileId back to the Firestore
 * document that originally created this queue entry.
 */
const updateFirestoreWithDriveId = async (
  firestoreDocPath: string,
  driveFileId: string,
  fieldName: string
) => {
  if (!firestoreDb) {
    console.warn('[SyncQueue] Firestore not initialized, skipping doc update for', firestoreDocPath);
    return;
  }
  const docRef = doc(firestoreDb, firestoreDocPath);
  await updateDoc(docRef, { [fieldName]: driveFileId });
};

// --- Queue processor ---

let isProcessing = false;

/**
 * Process all pending and retriable items in the queue.
 * Automatically creates the "Unassigned Uploads / {YYYY}" folder hierarchy,
 * uploads each file, updates Firestore, and removes completed items.
 * Failed items are kept with incremented retry counts for automatic retry.
 */
export const processQueue = async (accessToken?: string | null) => {
  if (!navigator.onLine || !accessToken || isProcessing) return;
  isProcessing = true;

  try {
    const db = await initDB();
    const allFiles = await db.getAll('FileQueue');
    if (allFiles.length === 0) return;

    // Filter to items that are eligible for processing
    const now = Date.now();
    const eligible = allFiles.filter((item) => {
      if (item.retryCount >= MAX_RETRIES) return false;
      if (item.status === 'uploading') return false; // stale uploading items handled below

      // Exponential backoff: don't retry too soon
      if (item.status === 'failed' && item.lastAttemptAt) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, item.retryCount - 1);
        if (now - item.lastAttemptAt < backoff) return false;
      }

      return true;
    });

    // Also recover stale "uploading" items (e.g. app crashed mid-upload) after 2 minutes
    const stale = allFiles.filter(
      (item) =>
        item.status === 'uploading' &&
        item.lastAttemptAt &&
        now - item.lastAttemptAt > 120_000
    );
    for (const item of stale) {
      item.status = 'failed';
      await db.put('FileQueue', item);
    }

    if (eligible.length === 0) return;

    // Pre-resolve the base folder once for the batch
    const baseFolderId = await findOrCreateFolder('Unassigned Uploads', accessToken);

    for (const item of eligible) {
      // Mark as uploading
      item.status = 'uploading';
      item.lastAttemptAt = Date.now();
      await db.put('FileQueue', item);

      try {
        const yearFolderId = await findOrCreateFolder(
          item.metadata.year.toString(),
          accessToken,
          baseFolderId
        );

        const driveFileId = await uploadFileToDrive(
          item.blob,
          item.metadata.fileName,
          yearFolderId,
          accessToken
        );

        // Update Firestore document with the real Drive file ID
        if (item.metadata.firestoreDocPath) {
          const fieldName = item.metadata.firestoreField || 'receiptFileId';
          await updateFirestoreWithDriveId(
            item.metadata.firestoreDocPath,
            driveFileId,
            fieldName
          );
        }

        // Success — remove from queue
        await db.delete('FileQueue', item.id);
        console.log(`[SyncQueue] Uploaded ${item.metadata.fileName} → Drive ID: ${driveFileId}`);
      } catch (error) {
        // Mark as failed with error details
        item.status = 'failed';
        item.retryCount += 1;
        item.lastError =
          error instanceof Error ? error.message : String(error);
        await db.put('FileQueue', item);
        console.warn(
          `[SyncQueue] Failed to upload ${item.metadata.fileName} (attempt ${item.retryCount}/${MAX_RETRIES}):`,
          item.lastError
        );
      }

      // Bail out early if we lost connectivity mid-batch
      if (!navigator.onLine) {
        console.log('[SyncQueue] Lost connectivity, pausing queue processing');
        break;
      }
    }
  } catch (error) {
    console.error('[SyncQueue] Queue processing error:', error);
  } finally {
    isProcessing = false;
  }
};

// --- Background sync manager ---

let pollTimer: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;

/**
 * Start the background sync monitor. Call once at app startup.
 * - Listens for online events to trigger immediate processing
 * - Polls every 30s while online to catch failed retries
 * - Accepts a function that returns the current access token
 */
export const startBackgroundSync = (getAccessToken: () => string | null) => {
  // Prevent double-start
  stopBackgroundSync();

  const tryProcess = () => {
    const token = getAccessToken();
    if (token && navigator.onLine) {
      processQueue(token);
    }
  };

  // Immediately try processing on startup
  tryProcess();

  // Listen for connectivity restoration
  onlineHandler = tryProcess;
  window.addEventListener('online', onlineHandler);

  // Periodic poll for retries of failed items
  pollTimer = setInterval(tryProcess, POLL_INTERVAL_MS);

  console.log('[SyncQueue] Background sync started');
};

/** Stop the background sync monitor (e.g. on sign-out). */
export const stopBackgroundSync = () => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (onlineHandler) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
};
