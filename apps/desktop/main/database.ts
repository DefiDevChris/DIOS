import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { CREATE_TABLES } from './schema'

let dbInstance: Database.Database | null = null

const ALLOWED_TABLES = new Set([
  'agencies',
  'operations',
  'inspections',
  'invoices',
  'expenses',
  'tasks',
  'notes',
  'operation_documents',
  'operation_activities',
  'system_config',
  'unassigned_uploads',
  'sync_status',
])

function validateTable(table: string): string {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table name: ${table}`)
  }
  return table
}

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance

  const dbPath = path.join(app.getPath('userData'), 'dios-studio.db')
  dbInstance = new Database(dbPath)

  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')

  dbInstance.exec(CREATE_TABLES)

  return dbInstance
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

export function findAll(table: string, filters?: Record<string, unknown>): unknown[] {
  const validTable = validateTable(table)
  const db = getDatabase()
  if (!filters || Object.keys(filters).length === 0) {
    return db.prepare(`SELECT * FROM ${validTable}`).all()
  }
  const safeKeys = Object.keys(filters).filter((k) => /^[a-zA-Z_]+$/.test(k))
  const conditions = safeKeys.map((k) => `${k} = @${k}`).join(' AND ')
  return db.prepare(`SELECT * FROM ${validTable} WHERE ${conditions}`).all(filters)
}

export function findById(table: string, id: string): unknown | undefined {
  const validTable = validateTable(table)
  const db = getDatabase()
  return db.prepare(`SELECT * FROM ${validTable} WHERE id = ?`).get(id)
}

export function upsert(table: string, record: Record<string, unknown>): void {
  const validTable = validateTable(table)
  const db = getDatabase()
  const now = new Date().toISOString()
  const data = { ...record, updatedAt: now, syncStatus: 'pending' }
  const columns = Object.keys(data).filter((k) => /^[a-zA-Z_]+$/.test(k))
  const placeholders = columns.map((c) => `@${c}`)
  const updates = columns
    .filter((c) => c !== 'id')
    .map((c) => `${c} = @${c}`)

  db.prepare(`
    INSERT INTO ${validTable} (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
  `).run(data)
}

export function remove(table: string, id: string): void {
  const validTable = validateTable(table)
  const db = getDatabase()
  db.prepare(`DELETE FROM ${validTable} WHERE id = ?`).run(id)
}
