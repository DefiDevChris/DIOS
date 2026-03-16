import { getDatabase } from './database.js'
import { logger } from '@dios/shared'

type SyncState = 'idle' | 'syncing' | 'error'

interface SyncConfig {
  firestoreToken: string
  driveToken: string
  userId: string
  projectId: string
  /** Optional: callback to get a fresh Firestore ID token */
  getFirestoreToken?: () => Promise<string>
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
  'system_config',
] as const

const BOOLEAN_FIELDS = new Set([
  'isBundled', 'reportCompleted',
  'isFlatRate', 'mileageReimbursed', 'perTypeRatesEnabled',
  'prepChecklistEnabled', 'reportChecklistEnabled',
])

let syncInterval: ReturnType<typeof setInterval> | null = null
let syncState: SyncState = 'idle'
let activeConfig: SyncConfig | null = null
// Track when the current token was set so we can refresh before 1-hour expiry
let tokenSetAt: number = 0

export function getSyncState(): SyncState {
  return syncState
}

export function getPendingCount(): number {
  try {
    const db = getDatabase()
    let total = 0
    for (const table of TABLES_TO_SYNC) {
      const row = db.prepare(
        `SELECT COUNT(*) as count FROM ${table} WHERE syncStatus = 'pending'`
      ).get() as { count: number }
      total += row.count
    }
    return total
  } catch (error) {
    logger.error('Failed to get pending count:', error)
    return 0
  }
}

export async function pullFromFirestore(config: SyncConfig): Promise<void> {
  const PULL_TABLES = [
    'agencies', 'operations', 'inspections', 'invoices',
    'expenses', 'tasks', 'notes', 'unassigned_uploads',
  ] as const

  const db = getDatabase()

  for (const table of PULL_TABLES) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${config.userId}/${table}`
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${config.firestoreToken}` },
      })
      if (!response.ok) {
        logger.warn(`Pull from Firestore failed for ${table}: ${response.status} ${response.statusText}`)
        continue
      }

      const data = await response.json() as { documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>>; updateTime?: string }> }
      const documents = data.documents ?? []

      for (const firestoreDoc of documents) {
        const docId = firestoreDoc.name.split('/').pop()!
        const fields = firestoreDoc.fields ?? {}

        // Convert Firestore field format to plain JS object
        const record: Record<string, unknown> = { id: docId }
        for (const [key, fieldValue] of Object.entries(fields)) {
          if ('stringValue' in fieldValue) record[key] = fieldValue.stringValue
          else if ('integerValue' in fieldValue) record[key] = Number(fieldValue.integerValue)
          else if ('doubleValue' in fieldValue) record[key] = fieldValue.doubleValue
          else if ('booleanValue' in fieldValue) record[key] = fieldValue.booleanValue ? 1 : 0
          else if ('nullValue' in fieldValue) record[key] = null
          else if ('timestampValue' in fieldValue) record[key] = fieldValue.timestampValue
        }

        // Only pull if local record doesn't exist or is older
        const existing = db.prepare(`SELECT updatedAt, syncStatus FROM ${table} WHERE id = ?`).get(docId) as { updatedAt: string; syncStatus: string } | undefined

        // Skip if local record is pending (has unsent local changes)
        if (existing?.syncStatus === 'pending') continue

        const remoteUpdatedAt = (record.updatedAt as string) ?? (firestoreDoc.updateTime ?? '')
        if (existing && existing.updatedAt >= remoteUpdatedAt) continue

        // Upsert the remote record as 'synced' (no re-push needed)
        record.syncStatus = 'synced'
        const columns = Object.keys(record).filter((k) => /^[a-zA-Z_]+$/.test(k))
        const placeholders = columns.map((c) => `@${c}`)
        const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = @${c}`)
        try {
          db.prepare(`
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders.join(', ')})
            ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
          `).run(record)
        } catch (err) {
          logger.error(`Pull upsert failed for ${table}/${docId}:`, err)
        }
      }
    } catch (error) {
      logger.error(`Failed to pull ${table} from Firestore:`, error)
    }
  }

  // Pull operation sub-collections
  await pullOperationSubCollections(config)
}

async function pullOperationSubCollections(config: SyncConfig): Promise<void> {
  const db = getDatabase()
  const operations = db.prepare('SELECT id FROM operations').all() as Array<{ id: string }>

  for (const op of operations) {
    for (const [subCollection, table] of [['documents', 'operation_documents'], ['activities', 'operation_activities']] as const) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${config.userId}/operations/${op.id}/${subCollection}`
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${config.firestoreToken}` },
        })
        if (!response.ok) continue

        const data = await response.json() as { documents?: Array<{ name: string; fields?: Record<string, Record<string, unknown>>; updateTime?: string }> }
        const documents = data.documents ?? []

        for (const firestoreDoc of documents) {
          const docId = firestoreDoc.name.split('/').pop()!
          const fields = firestoreDoc.fields ?? {}

          const record: Record<string, unknown> = { id: docId, operationId: op.id }
          for (const [key, fieldValue] of Object.entries(fields)) {
            if ('stringValue' in fieldValue) record[key] = fieldValue.stringValue
            else if ('integerValue' in fieldValue) record[key] = Number(fieldValue.integerValue)
            else if ('doubleValue' in fieldValue) record[key] = fieldValue.doubleValue
            else if ('booleanValue' in fieldValue) record[key] = fieldValue.booleanValue ? 1 : 0
            else if ('nullValue' in fieldValue) record[key] = null
            else if ('timestampValue' in fieldValue) record[key] = fieldValue.timestampValue
          }

          const existing = db.prepare(`SELECT updatedAt, syncStatus FROM ${table} WHERE id = ?`).get(docId) as { updatedAt: string; syncStatus: string } | undefined
          if (existing?.syncStatus === 'pending') continue

          const remoteUpdatedAt = (record.updatedAt as string) ?? (firestoreDoc.updateTime ?? '')
          if (existing && existing.updatedAt >= remoteUpdatedAt) continue

          record.syncStatus = 'synced'
          const columns = Object.keys(record).filter((k) => /^[a-zA-Z_]+$/.test(k))
          const placeholders = columns.map((c) => `@${c}`)
          const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = @${c}`)
          try {
            db.prepare(`
              INSERT INTO ${table} (${columns.join(', ')})
              VALUES (${placeholders.join(', ')})
              ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
            `).run(record)
          } catch (err) {
            logger.error(`Pull upsert failed for ${table}/${docId}:`, err)
          }
        }
      } catch (error) {
        logger.error(`Failed to pull ${subCollection} for operation ${op.id}:`, error)
      }
    }
  }
}

export async function syncTable(
  table: string,
  config: SyncConfig,
): Promise<{ synced: number; failed: number }> {
  // Special handling for system_config - it's a single document, not a collection
  if (table === 'system_config') {
    return syncSystemConfig(config)
  }

  const db = getDatabase()

  // Recover any orphaned 'syncing' or 'failed' records for retry
  db.prepare(
    `UPDATE ${table} SET syncStatus = 'pending' WHERE syncStatus IN ('syncing', 'failed')`
  ).run()

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

  // Process each record atomically - update local status only after Firestore confirms
  for (const record of pending) {
    let pushSuccess = false
    try {
      if (!collectionPath) {
        const opId = record['operationId'] as string
        const subCollection = table === 'operation_documents' ? 'documents' : 'activities'
        const subPath = `users/${config.userId}/operations/${opId}/${subCollection}`
        await pushToFirestore(subPath, record, config)
      } else {
        await pushToFirestore(collectionPath, record, config)
      }
      pushSuccess = true
    } catch (error) {
      logger.error(`Failed to push record ${record['id']} to Firestore:`, error)
    }

    // Update local status after Firestore operation completes
    const updateStatus = db.prepare(
      `UPDATE ${table} SET syncStatus = ? WHERE id = ?`
    )
    if (pushSuccess) {
      updateStatus.run('synced', record['id'])
      synced++
    } else {
      updateStatus.run('failed', record['id'])
      failed++
    }
  }

  return { synced, failed }
}

async function syncSystemConfig(config: SyncConfig): Promise<{ synced: number; failed: number }> {
  const db = getDatabase()

  // Recover any orphaned 'syncing' records from a previous crash
  db.prepare(
    `UPDATE system_config SET syncStatus = 'pending' WHERE syncStatus = 'syncing'`
  ).run()

  // Use a transaction to prevent race conditions
  // Capture all pending records atomically at the start
  const transaction = db.transaction(() => {
    const pending = db.prepare(
      `SELECT * FROM system_config WHERE syncStatus = 'pending' ORDER BY key`
    ).all() as Array<{ key: string; value: string; updatedAt: string }>

    // Mark records as syncing to prevent concurrent processing
    for (const record of pending) {
      db.prepare(`UPDATE system_config SET syncStatus = 'syncing' WHERE key = ?`).run(record.key)
    }

    return pending
  })
  
  const pending = transaction() as Array<{ key: string; value: string; updatedAt: string }>
  
  if (pending.length === 0) {
    return { synced: 0, failed: 0 }
  }

  let synced = 0
  let failed = 0

  try {
    // Build the document path - system_settings/config
    const docPath = `users/${config.userId}/system_settings/config`
    
    // Convert key-value pairs to a document
    const fields: Record<string, unknown> = {}
    
    for (const row of pending) {
      // Try to parse as JSON, otherwise store as string
      try {
        fields[row.key] = JSON.parse(row.value)
      } catch {
        fields[row.key] = row.value
      }
    }
    
    await pushDocumentToFirestore(docPath, fields, config)
    
    // Mark all as synced
    for (const row of pending) {
      db.prepare(`UPDATE system_config SET syncStatus = 'synced' WHERE key = ?`).run(row.key)
    }
    
    synced = pending.length
  } catch (error) {
    logger.error('Failed to sync system_config:', error)
    // Mark all syncing records as failed
    for (const row of pending) {
      db.prepare(`UPDATE system_config SET syncStatus = 'failed' WHERE key = ?`).run(row.key)
    }
    failed = pending.length
  }

  return { synced, failed }
}

async function pushDocumentToFirestore(
  documentPath: string,
  fields: Record<string, unknown>,
  config: SyncConfig,
): Promise<void> {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${documentPath}`

  const firestoreFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      firestoreFields[key] = { nullValue: null }
      continue
    }
    if (typeof value === 'boolean') {
      firestoreFields[key] = { booleanValue: value }
    } else if (typeof value === 'string') {
      firestoreFields[key] = { stringValue: value }
    } else if (typeof value === 'number') {
      firestoreFields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value }
    } else if (typeof value === 'object') {
      firestoreFields[key] = { 
        stringValue: JSON.stringify(value) 
      }
    }
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${config.firestoreToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: firestoreFields }),
  })

  if (!response.ok) {
    throw new Error(`Firestore sync failed: ${response.status} ${response.statusText}`)
  }
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
    const existing = db.prepare('SELECT syncStatus FROM unassigned_uploads WHERE id = ?').get(docId) as { syncStatus: string } | undefined
    if (existing?.syncStatus === 'pending') continue

    const fields = doc.fields ?? {}
    db.prepare(`
      INSERT INTO unassigned_uploads (id, fileName, fileType, fileUrl, uploadedAt, source, operationId, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
      ON CONFLICT(id) DO UPDATE SET
        fileName = excluded.fileName,
        fileType = excluded.fileType,
        fileUrl = excluded.fileUrl,
        source = excluded.source,
        operationId = excluded.operationId,
        syncStatus = 'synced'
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

export function startSync(config: SyncConfig, intervalMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (syncInterval) {
      // Update config even if interval is already running (e.g. re-login with new credentials)
      activeConfig = config
      tokenSetAt = Date.now()
      resolve()
      return
    }

    activeConfig = config
    tokenSetAt = Date.now()

    const runSync = async () => {
      if (!activeConfig) return
      syncState = 'syncing'
      try {
        // Refresh Firestore token if it's been more than 50 minutes (tokens expire at 60 min)
        if (activeConfig.getFirestoreToken && Date.now() - tokenSetAt > 50 * 60 * 1000) {
          try {
            const freshToken = await activeConfig.getFirestoreToken()
            activeConfig = { ...activeConfig, firestoreToken: freshToken }
            tokenSetAt = Date.now()
            logger.info('Firestore token refreshed in sync engine')
          } catch (err) {
            logger.error('Failed to refresh Firestore token:', err)
          }
        }

        await pullFromFirestore(activeConfig)
        for (const table of TABLES_TO_SYNC) {
          await syncTable(table, activeConfig)
        }
        syncState = 'idle'
      } catch (error) {
        logger.error('Sync loop failed:', error)
        syncState = 'error'
      }
    }

    runSync()
      .then(() => {
        syncInterval = setInterval(runSync, intervalMs)
        resolve()
      })
      .catch((error) => {
        logger.error('Failed to start sync:', error)
        syncState = 'error'
        reject(error)
      })
  })
}

export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  syncState = 'idle'
  activeConfig = null
}
