import { db } from '@dios/shared/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export interface DriveFolders {
  masterId?: string;
  unassignedId?: string;
  receiptsId?: string;
  reportsId?: string;
}

async function getOrCreateFolder(name: string, accessToken: string, parentId?: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`;
  q += parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw new Error(`Drive folder search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  if (searchData.files?.length > 0) return searchData.files[0].id;

  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!createRes.ok) throw new Error(`Drive folder creation failed: ${createRes.status}`);
  const createData = await createRes.json();
  return createData.id;
}

export async function initializeDriveHierarchy(accessToken: string, userId: string): Promise<DriveFolders> {
  const masterId = await getOrCreateFolder('DIOS Master Inspections Database', accessToken);
  const unassignedId = await getOrCreateFolder('Unassigned Uploads', accessToken, masterId);
  const receiptsId = await getOrCreateFolder('Receipts', accessToken, masterId);
  const reportsId = await getOrCreateFolder('Reports', accessToken, masterId);

  const folders: DriveFolders = { masterId, unassignedId, receiptsId, reportsId };

  if (!db) throw new Error('Firestore is not initialized');
  const configRef = doc(db, `users/${userId}/system_settings/config`);
  const configSnap = await getDoc(configRef);
  if (configSnap.exists()) {
    await updateDoc(configRef, { driveFolders: folders });
  } else {
    await setDoc(configRef, { driveFolders: folders }, { merge: true });
  }

  return folders;
}

export async function ensureOperationFolder(
  accessToken: string,
  userId: string,
  agencyName: string,
  operationName: string,
): Promise<string | null> {
  try {
    if (!db) throw new Error('Firestore is not initialized');
    const configRef = doc(db, `users/${userId}/system_settings/config`);
    const configSnap = await getDoc(configRef);
    let masterId = (configSnap.data()?.driveFolders as DriveFolders | undefined)?.masterId;
    if (!masterId) {
      const folders = await initializeDriveHierarchy(accessToken, userId);
      masterId = folders.masterId;
    }
    if (!masterId) return null;

    const agencyFolderId = await getOrCreateFolder(agencyName, accessToken, masterId);
    return await getOrCreateFolder(operationName, accessToken, agencyFolderId);
  } catch {
    return null;
  }
}

export async function uploadToDrive(
  accessToken: string,
  userId: string,
  file: File,
  agencyName: string,
  operationName: string,
  year: string,
): Promise<{ id: string; webViewLink: string }> {
  if (!db) throw new Error('Firestore is not initialized');
  const configRef = doc(db, `users/${userId}/system_settings/config`);
  const configSnap = await getDoc(configRef);
  let masterId = (configSnap.data()?.driveFolders as DriveFolders | undefined)?.masterId;
  if (!masterId) {
    const folders = await initializeDriveHierarchy(accessToken, userId);
    masterId = folders.masterId;
  }
  if (!masterId) throw new Error('Failed to find or create master folder.');

  const agencyFolderId = await getOrCreateFolder(agencyName, accessToken, masterId);
  const operationFolderId = await getOrCreateFolder(operationName, accessToken, agencyFolderId);
  const yearFolderId = await getOrCreateFolder(year, accessToken, operationFolderId);

  const metadata = { name: file.name, parents: [yearFolderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  );
  if (!uploadRes.ok) throw new Error(`Failed to upload file to Drive: ${await uploadRes.text()}`);
  return uploadRes.json();
}

export async function getOperationDriveFolderUrl(
  accessToken: string,
  userId: string,
  agencyName: string,
  operationName: string,
  year: string,
): Promise<string> {
  if (!db) throw new Error('Firestore is not initialized');
  const configRef = doc(db, `users/${userId}/system_settings/config`);
  const configSnap = await getDoc(configRef);
  let masterId = (configSnap.data()?.driveFolders as DriveFolders | undefined)?.masterId;
  if (!masterId) {
    const folders = await initializeDriveHierarchy(accessToken, userId);
    masterId = folders.masterId;
  }
  if (!masterId) throw new Error('Failed to find or create master folder.');

  const agencyFolderId = await getOrCreateFolder(agencyName, accessToken, masterId);
  const operationFolderId = await getOrCreateFolder(operationName, accessToken, agencyFolderId);
  const yearFolderId = await getOrCreateFolder(year, accessToken, operationFolderId);
  return `https://drive.google.com/drive/folders/${yearFolderId}`;
}
