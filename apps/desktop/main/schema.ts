import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 2

export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS agencies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    billingAddress TEXT NOT NULL,
    flatRateBaseAmount REAL NOT NULL DEFAULT 0,
    flatRateIncludedHours REAL NOT NULL DEFAULT 0,
    additionalHourlyRate REAL NOT NULL DEFAULT 0,
    mileageRate REAL NOT NULL DEFAULT 0,
    travelTimeHourlyRate REAL DEFAULT NULL,
    perDiemRate REAL DEFAULT NULL,
    driveBillingMethod TEXT NOT NULL DEFAULT 'hourly',
    isFlatRate INTEGER NOT NULL DEFAULT 0,
    flatRateAmount REAL NOT NULL DEFAULT 0,
    flatRateOverageRate REAL NOT NULL DEFAULT 0,
    hourlyRate REAL NOT NULL DEFAULT 0,
    driveTimeHourlyRate REAL NOT NULL DEFAULT 0,
    mileageReimbursed INTEGER NOT NULL DEFAULT 0,
    perTypeRatesEnabled INTEGER NOT NULL DEFAULT 0,
    ratesByType TEXT NOT NULL DEFAULT '{}',
    operationTypes TEXT NOT NULL DEFAULT '["crop","handler"]',
    billingEmail TEXT NOT NULL DEFAULT '',
    billingContactName TEXT NOT NULL DEFAULT '',
    emailTemplateSubject TEXT NOT NULL DEFAULT '{operatorName} Invoice',
    emailTemplateBody TEXT NOT NULL DEFAULT '',
    prepChecklistEnabled INTEGER NOT NULL DEFAULT 1,
    prepChecklistItems TEXT NOT NULL DEFAULT '["Prep complete"]',
    reportChecklistEnabled INTEGER NOT NULL DEFAULT 1,
    reportChecklistItems TEXT NOT NULL DEFAULT '["Report complete"]',
    defaultLineItems TEXT NOT NULL DEFAULT '[]',
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    agencyId TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    contactName TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT DEFAULT NULL,
    quickNote TEXT DEFAULT NULL,
    operationType TEXT NOT NULL DEFAULT '',
    clientId TEXT NOT NULL DEFAULT '',
    cachedDistanceMiles REAL DEFAULT NULL,
    cachedDriveTimeMinutes REAL DEFAULT NULL,
    lat REAL DEFAULT NULL,
    lng REAL DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (agencyId) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS inspections (
    id TEXT PRIMARY KEY,
    operationId TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Scheduled',
    baseHoursLog REAL NOT NULL DEFAULT 0,
    additionalHoursLog REAL NOT NULL DEFAULT 0,
    milesDriven REAL NOT NULL DEFAULT 0,
    bundleId TEXT DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    isBundled INTEGER DEFAULT 0,
    totalTripDriveTime REAL DEFAULT NULL,
    totalTripStops INTEGER DEFAULT NULL,
    sharedDriveTime REAL DEFAULT NULL,
    mealsAndExpenses REAL DEFAULT NULL,
    perDiemDays REAL DEFAULT NULL,
    customLineItemName TEXT DEFAULT NULL,
    customLineItemAmount REAL DEFAULT NULL,
    invoiceNotes TEXT DEFAULT NULL,
    invoiceExceptions TEXT DEFAULT NULL,
    prepHours REAL NOT NULL DEFAULT 0,
    onsiteHours REAL NOT NULL DEFAULT 0,
    reportHours REAL NOT NULL DEFAULT 0,
    prepChecklistData TEXT NOT NULL DEFAULT '[]',
    reportChecklistData TEXT NOT NULL DEFAULT '[]',
    calculatedMileage REAL NOT NULL DEFAULT 0,
    calculatedDriveTime REAL NOT NULL DEFAULT 0,
    reportCompleted INTEGER DEFAULT 0,
    googleCalendarEventId TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (operationId) REFERENCES operations(id)
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    inspectionId TEXT NOT NULL,
    agencyId TEXT NOT NULL,
    totalAmount REAL NOT NULL DEFAULT 0,
    pdfDriveId TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Not Complete',
    sentDate TEXT DEFAULT NULL,
    paidDate TEXT DEFAULT NULL,
    lineItems TEXT DEFAULT NULL,
    operationId TEXT NOT NULL DEFAULT '',
    operationName TEXT NOT NULL DEFAULT '',
    agencyName TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    inspectionDate TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL DEFAULT '',
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (inspectionId) REFERENCES inspections(id),
    FOREIGN KEY (agencyId) REFERENCES agencies(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    vendor TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT NULL,
    receiptImageUrl TEXT DEFAULT NULL,
    receiptFileId TEXT DEFAULT NULL,
    inspectionId TEXT DEFAULT NULL,
    category TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    dueDate TEXT DEFAULT NULL,
    operationId TEXT DEFAULT NULL,
    inspectionId TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    operationId TEXT DEFAULT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now')),
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS operation_documents (
    id TEXT PRIMARY KEY,
    operationId TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT '',
    uploadedAt TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    localPath TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (operationId) REFERENCES operations(id)
  );

  CREATE TABLE IF NOT EXISTS operation_activities (
    id TEXT PRIMARY KEY,
    operationId TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending',
    FOREIGN KEY (operationId) REFERENCES operations(id)
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS unassigned_uploads (
    id TEXT PRIMARY KEY,
    fileName TEXT NOT NULL,
    fileType TEXT NOT NULL DEFAULT '',
    fileUrl TEXT NOT NULL DEFAULT '',
    localPath TEXT DEFAULT NULL,
    uploadedAt TEXT NOT NULL DEFAULT (datetime('now')),
    source TEXT NOT NULL DEFAULT 'desktop',
    operationId TEXT DEFAULT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    syncStatus TEXT NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS sync_status (
    tableName TEXT NOT NULL,
    recordId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    lastSyncedAt TEXT DEFAULT NULL,
    lastError TEXT DEFAULT NULL,
    PRIMARY KEY (tableName, recordId)
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
`

function safeAddColumn(db: Database.Database, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('duplicate column')) {
      console.error(`Migration error adding ${table}.${column}:`, message)
    }
  }
}

export function migrateSchema(db: Database.Database): void {
  // --- agencies new columns ---
  safeAddColumn(db, 'agencies', 'isFlatRate', "INTEGER NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'flatRateAmount', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'flatRateOverageRate', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'hourlyRate', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'driveTimeHourlyRate', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'mileageReimbursed', "INTEGER NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'perTypeRatesEnabled', "INTEGER NOT NULL DEFAULT 0")
  safeAddColumn(db, 'agencies', 'ratesByType', "TEXT NOT NULL DEFAULT '{}'")
  safeAddColumn(db, 'agencies', 'operationTypes', "TEXT NOT NULL DEFAULT '[\"crop\",\"handler\"]'")
  safeAddColumn(db, 'agencies', 'billingEmail', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'agencies', 'billingContactName', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'agencies', 'emailTemplateSubject', "TEXT NOT NULL DEFAULT '{operatorName} Invoice'")
  safeAddColumn(db, 'agencies', 'emailTemplateBody', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'agencies', 'prepChecklistEnabled', "INTEGER NOT NULL DEFAULT 1")
  safeAddColumn(db, 'agencies', 'prepChecklistItems', "TEXT NOT NULL DEFAULT '[\"Prep complete\"]'")
  safeAddColumn(db, 'agencies', 'reportChecklistEnabled', "INTEGER NOT NULL DEFAULT 1")
  safeAddColumn(db, 'agencies', 'reportChecklistItems', "TEXT NOT NULL DEFAULT '[\"Report complete\"]'")
  safeAddColumn(db, 'agencies', 'defaultLineItems', "TEXT NOT NULL DEFAULT '[]'")

  // --- operations new columns ---
  safeAddColumn(db, 'operations', 'operationType', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'operations', 'clientId', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'operations', 'cachedDistanceMiles', "REAL DEFAULT NULL")
  safeAddColumn(db, 'operations', 'cachedDriveTimeMinutes', "REAL DEFAULT NULL")

  // --- inspections new columns ---
  safeAddColumn(db, 'inspections', 'prepHours', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'inspections', 'onsiteHours', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'inspections', 'reportHours', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'inspections', 'prepChecklistData', "TEXT NOT NULL DEFAULT '[]'")
  safeAddColumn(db, 'inspections', 'reportChecklistData', "TEXT NOT NULL DEFAULT '[]'")
  safeAddColumn(db, 'inspections', 'calculatedMileage', "REAL NOT NULL DEFAULT 0")
  safeAddColumn(db, 'inspections', 'calculatedDriveTime', "REAL NOT NULL DEFAULT 0")

  // --- invoices new columns ---
  safeAddColumn(db, 'invoices', 'sentDate', "TEXT DEFAULT NULL")
  safeAddColumn(db, 'invoices', 'paidDate', "TEXT DEFAULT NULL")
  safeAddColumn(db, 'invoices', 'lineItems', "TEXT DEFAULT NULL")
  safeAddColumn(db, 'invoices', 'operationId', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'invoices', 'operationName', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'invoices', 'agencyName', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'invoices', 'date', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'invoices', 'inspectionDate', "TEXT NOT NULL DEFAULT ''")
  safeAddColumn(db, 'invoices', 'createdAt', "TEXT NOT NULL DEFAULT ''")

  // --- notes new columns ---
  safeAddColumn(db, 'notes', 'operationId', "TEXT DEFAULT NULL")

  // --- Data migrations for existing databases ---
  try {
    // Map old agency rate fields to new fields
    db.exec(`
      UPDATE agencies SET
        flatRateAmount = flatRateBaseAmount,
        flatRateOverageRate = additionalHourlyRate,
        driveTimeHourlyRate = COALESCE(travelTimeHourlyRate, 0)
      WHERE flatRateAmount = 0 AND flatRateOverageRate = 0 AND driveTimeHourlyRate = 0
    `)

    // Set mileageReimbursed = 1 where old mileageRate > 0
    db.exec(`
      UPDATE agencies SET mileageReimbursed = 1
      WHERE mileageRate > 0 AND mileageReimbursed = 0
    `)

    // Set isFlatRate = 1 where old flatRateBaseAmount > 0
    db.exec(`
      UPDATE agencies SET isFlatRate = 1
      WHERE flatRateBaseAmount > 0 AND isFlatRate = 0
    `)

    // Map invoice statuses: 'Unpaid' -> 'Sent'
    db.exec(`
      UPDATE invoices SET status = 'Sent'
      WHERE status = 'Unpaid'
    `)

    // Set paidDate = date for existing 'Paid' invoices
    db.exec(`
      UPDATE invoices SET paidDate = updatedAt
      WHERE status = 'Paid' AND paidDate IS NULL
    `)

    // Map inspection statuses: 'In Progress' -> 'Scheduled', 'Completed' -> 'Paid'
    db.exec(`
      UPDATE inspections SET status = 'Scheduled'
      WHERE status = 'In Progress'
    `)

    db.exec(`
      UPDATE inspections SET status = 'Paid'
      WHERE status = 'Completed'
    `)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Data migration error:', message)
  }

  // Update schema version
  try {
    db.exec(`UPDATE schema_version SET version = ${SCHEMA_VERSION}`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Schema version update error:', message)
  }
}
