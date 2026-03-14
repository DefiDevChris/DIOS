export const SCHEMA_VERSION = 1

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
    inspectionStatus TEXT DEFAULT NULL,
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
    status TEXT NOT NULL DEFAULT 'Unpaid',
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
