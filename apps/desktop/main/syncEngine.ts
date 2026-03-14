import { getDatabase } from './database'

type SyncState = 'idle' | 'syncing' | 'error'

interface SyncConfig {
  firestoreToken: string
  driveToken: string
  userId: string
  projectId: string
}

const TABLES_TO_SYNC = [
  'agencies',
  'operations',
  'inspections',
  'invoices',
  'expenses',
  'tasks',
  'notes',
  'operation_documents',
  'operation_activities',
  'unassigned_uploads',
] as const

const BOOLEAN_FIELDS = new Set([
  'isBundled', 'reportCompleted',
  'isFlatRate', 'mileageReimbursed', 'perTypeRatesEnabled',
  'prepChecklistEnabled', 'reportChecklistEnabled',
])

let syncInterval: ReturnType<typeof setInterval> | null = null
let syncState: SyncState = 'idle'

export function getSyncState(): SyncState {
  return syncState
}

export function getPendingCount(): number {
  const db = getDatabase()
  let total = 0
  for (const table of TABLES_TO_SYNC) {
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM ${table} WHERE syncStatus = 'pending'`
    ).get() as { count: number }
    total += row.count
  }
  return total
}

export async function syncTable(
  table: string,
  config: SyncConfig,
): Promise<{ synced: number; failed: number }> {
  const db = getDatabase()
  const pending = db.prepare(
    `SELECT * FROM ${table} WHERE syncStatus = 'pending'`
  ).all() as Record<string, unknown>[]

  let synced = 0
  let failed = 0

  const collectionPath = table === 'operation_documents'
    ? null
    : table === 'operation_activities'
    ? null
    : `users/${config.userId}/${table}`

  for (const record of pending) {
    try {
      if (!collectionPath) {
        const opId = record['operationId'] as string
        const subCollection = table === 'operation_documents' ? 'documents' : 'activities'
        const subPath = `users/${config.userId}/operations/${opId}/${subCollection}`
        await pushToFirestore(subPath, record, config)
      } else {
        await pushToFirestore(collectionPath, record, config)
      }

      db.prepare(
        `UPDATE ${table} SET syncStatus = 'synced' WHERE id = ?`
      ).run(record['id'])

      synced++
    } catch {
      db.prepare(
        `UPDATE ${table} SET syncStatus = 'failed' WHERE id = ?`
      ).run(record['id'])
      failed++
    }
  }

  return { synced, failed }
}

async function pushToFirestore(
  collectionPath: string,
  record: Record<string, unknown>,
  config: SyncConfig,
): Promise<void> {
  const docId = record['id'] as string
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${collectionPath}/${docId}`

  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'syncStatus' || key === 'updatedAt') continue
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null }
      continue
    }
    if (BOOLEAN_FIELDS.has(key)) {
      fields[key] = { booleanValue: !!value }
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value }
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value }
    }
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${config.firestoreToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    throw new Error(`Firestore sync failed: ${response.status} ${response.statusText}`)
  }
}

export async function pullUnassignedUploads(config: SyncConfig): Promise<number> {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${config.userId}/unassigned_uploads`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.firestoreToken}` },
  })
  if (!response.ok) return 0

  const data = await response.json() as { documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>> }> }
  const documents = data.documents ?? []
  const db = getDatabase()
  let pulled = 0

  for (const doc of documents) {
    const docId = doc.name.split('/').pop()!
    const existing = db.prepare('SELECT id FROM unassigned_uploads WHERE id = ?').get(docId)
    if (existing) continue

    const fields = doc.fields ?? {}
    db.prepare(`
      INSERT OR IGNORE INTO unassigned_uploads (id, fileName, fileType, fileUrl, uploadedAt, source, operationId, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
    `).run(
      docId,
      (fields.fileName?.stringValue as string) ?? '',
      (fields.fileType?.stringValue as string) ?? '',
      (fields.fileUrl?.stringValue as string) ?? '',
      (fields.uploadedAt?.timestampValue as string) ?? new Date().toISOString(),
      (fields.source?.stringValue as string) ?? 'mobile',
      (fields.operationId?.stringValue as string) ?? null,
    )
    pulled++
  }
  return pulled
}

export function startSync(config: SyncConfig, intervalMs = 60_000): void {
  if (syncInterval) return

  const runSync = async () => {
    syncState = 'syncing'
    try {
      await pullUnassignedUploads(config)
      for (const table of TABLES_TO_SYNC) {
        await syncTable(table, config)
      }
      syncState = 'idle'
    } catch {
      syncState = 'error'
    }
  }

  runSync()
  syncInterval = setInterval(runSync, intervalMs)
}

export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  syncState = 'idle'
}
