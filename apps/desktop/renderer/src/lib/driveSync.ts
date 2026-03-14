import { gapi } from 'gapi-script';
import { db } from '@dios/shared/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export interface DriveFolders {
  masterId?: string;
  unassignedId?: string;
  receiptsId?: string;
  reportsId?: string;
  agenciesId?: string;
}

// Ensure gapi client is loaded
const initGapiClient = async (accessToken: string) => {
  return new Promise<void>((resolve, reject) => {
    gapi.load('client', () => {
      gapi.client.init({
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      }).then(() => {
        gapi.client.setToken({ access_token: accessToken });
        resolve();
      }).catch(reject);
    });
  });
};

// Helper to check if a folder exists and return its ID, or create it if not
async function getOrCreateFolder(folderName: string, parentId?: string): Promise<string> {
  const escapedName = folderName.replace(/'/g, "\\'");
  let query = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += ` and 'root' in parents`;
  }

  // Use gapi.client.drive
  const drive = gapi.client.drive as any;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const files = response.result.files;
  if (files && files.length > 0) {
    return files[0].id;
  }

  const createResponse = await drive.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });

  return createResponse.result.id;
}

export async function initializeDriveHierarchy(accessToken: string, userId: string): Promise<DriveFolders> {
  await initGapiClient(accessToken);

  const masterId = await getOrCreateFolder('DIOS Master Inspections Database');

  const unassignedId = await getOrCreateFolder('Unassigned Uploads', masterId);
  const receiptsId = await getOrCreateFolder('Receipts', masterId);
  const reportsId = await getOrCreateFolder('Reports', masterId);
  const agenciesId = await getOrCreateFolder('Agencies', masterId);

  const folders: DriveFolders = {
    masterId,
    unassignedId,
    receiptsId,
    reportsId,
    agenciesId,
  };

  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  const configRef = doc(db, `users/${userId}/system_settings/config`);
  const configSnap = await getDoc(configRef);
  if (configSnap.exists()) {
    await updateDoc(configRef, { driveFolders: folders });
  } else {
    await setDoc(configRef, { driveFolders: folders }, { merge: true });
  }

  return folders;
}

export async function uploadToDrive(
  accessToken: string,
  userId: string,
  file: File,
  agencyName: string,
  operationName: string,
  year: string
): Promise<{ id: string, webViewLink: string }> {
  await initGapiClient(accessToken);

  if (!db) {
    throw new Error('Firestore is not initialized');
  }

  const configRef = doc(db, `users/${userId}/system_settings/config`);
  const configSnap = await getDoc(configRef);
  const driveFolders = configSnap.data()?.driveFolders as DriveFolders | undefined;

  let agenciesId = driveFolders?.agenciesId;
  if (!agenciesId) {
    const folders = await initializeDriveHierarchy(accessToken, userId);
    agenciesId = folders.agenciesId;
  }

  if (!agenciesId) {
    throw new Error('Failed to find or create Agencies folder.');
  }

  const agencyFolderId = await getOrCreateFolder(agencyName, agenciesId);
  const operationFolderId = await getOrCreateFolder(operationName, agencyFolderId);
  const yearFolderId = await getOrCreateFolder(year, operationFolderId);

  const metadata = {
    name: file.name,
    parents: [yearFolderId],
  };

  const boundary = '-------314159265358979323846';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const reader = new FileReader();
  const fileData = await new Promise<string>((resolve, reject) => {
    reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]); // get base64 part
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + file.type + '\r\n' +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    fileData +
    close_delim;

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload file to Drive: ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  return { id: uploadData.id, webViewLink: uploadData.webViewLink };
}
