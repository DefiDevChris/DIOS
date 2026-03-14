// Utility to handle File System Access API for local mirroring
import { logger } from '@dios/shared';

const DIRECTORY_HANDLE_KEY = 'dois_studio_local_folder_handle';

export async function requestLocalFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) {
    logger.warn('File System Access API is not supported in this browser.');
    return null;
  }

  try {
    const directoryHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    // We can't use standard localStorage to store handles, we must use IndexedDB.
    await storeHandleInIndexedDB(directoryHandle);

    return directoryHandle;
  } catch (error) {
    logger.error('Error requesting local folder:', error);
    return null;
  }
}

export async function getStoredLocalFolder(requestIfPrompt: boolean = false): Promise<FileSystemDirectoryHandle | null> {
  if (!('showDirectoryPicker' in window)) return null;

  try {
    const handle = await getHandleFromIndexedDB();
    if (!handle) return null;

    // Verify permission
    const anyHandle = handle as any;
    if (anyHandle.queryPermission && anyHandle.requestPermission) {
      const permission = await anyHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        return handle;
      }

      if (requestIfPrompt && permission === 'prompt') {
        // Request permission again if not granted
        const requestPermission = await anyHandle.requestPermission({ mode: 'readwrite' });
        if (requestPermission === 'granted') {
          return handle;
        }
      } else if (!requestIfPrompt) {
        // If we shouldn't prompt, return null so we don't cause SecurityErrors
        return null;
      }
    } else {
      // If query/request permission are not available, just return the handle (might be already granted or unsupported)
      return handle;
    }

    return null;
  } catch (error) {
    logger.error('Error getting stored local folder:', error);
    return null;
  }
}

export async function writeLocalFile(
  directoryHandle: FileSystemDirectoryHandle,
  pathArray: string[],
  file: File
): Promise<void> {
  try {
    let currentDir = directoryHandle;

    // Navigate/create subdirectories
    for (const folderName of pathArray) {
      currentDir = await currentDir.getDirectoryHandle(folderName, { create: true });
    }

    // Create or overwrite file
    const fileHandle = await currentDir.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  } catch (error) {
    logger.error('Error writing local file:', error);
    throw error;
  }
}

// --- IndexedDB Helpers ---
const DB_NAME = 'dois_studio_fs_db';
const STORE_NAME = 'handles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    request.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function storeHandleInIndexedDB(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(handle, DIRECTORY_HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}

async function getHandleFromIndexedDB(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(DIRECTORY_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}
