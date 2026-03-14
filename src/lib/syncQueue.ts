import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface SyncDB extends DBSchema {
  FileQueue: {
    key: string;
    value: {
      id: string;
      blob: Blob;
      metadata: {
        fileName: string;
        year: number;
        uid: string;
      };
    };
  };
}

let dbPromise: Promise<IDBPDatabase<SyncDB>> | null = null;

const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<SyncDB>('DOIS_Sync', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('FileQueue')) {
          db.createObjectStore('FileQueue', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};

export const queueFile = async (blob: Blob, metadata: { fileName: string; year: number; uid: string }) => {
  const db = await initDB();
  const id = crypto.randomUUID();
  await db.put('FileQueue', { id, blob, metadata });
};

const findOrCreateFolder = async (name: string, accessToken: string, parentId?: string): Promise<string> => {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createMetadata: any = {
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

  const createData = await createRes.json();
  return createData.id;
};

let isProcessing = false;

export const processQueue = async (accessToken?: string | null) => {
  if (!navigator.onLine || !accessToken || isProcessing) return;
  isProcessing = true;

  try {
    const db = await initDB();
    const allFiles = await db.getAll('FileQueue');
    if (allFiles.length === 0) {
      isProcessing = false;
      return;
    }

    const baseFolderId = await findOrCreateFolder('Unassigned Uploads', accessToken);

    for (const file of allFiles) {
      const yearFolderId = await findOrCreateFolder(file.metadata.year.toString(), accessToken, baseFolderId);

      const metadata = {
        name: file.metadata.fileName,
        parents: [yearFolderId],
      };

      // Use resumable upload to avoid multipart boundary issues
      const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': file.blob.type || 'application/octet-stream',
          'X-Upload-Content-Length': file.blob.size.toString(),
        },
        body: JSON.stringify(metadata),
      });

      if (!initRes.ok) {
        console.error('Failed to init resumable upload to Drive:', await initRes.text());
        continue;
      }

      const locationUrl = initRes.headers.get('Location');
      if (!locationUrl) {
        console.error('No Location header returned from Drive API for resumable upload');
        continue;
      }

      const uploadRes = await fetch(locationUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.blob.type || 'application/octet-stream',
        },
        body: file.blob,
      });

      if (uploadRes.ok) {
        await db.delete('FileQueue', file.id);
      } else {
        console.error('Failed to upload file to Drive:', await uploadRes.text());
      }
    }
  } catch (error) {
    console.error('Error processing queue:', error);
  } finally {
    isProcessing = false;
  }
};
