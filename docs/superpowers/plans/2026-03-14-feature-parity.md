# Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring DIOS Studio to feature parity with the legacy A11 app across 6 features: inspection workflow with checklists, invoice editor/emailing, business profile/onboarding, distance calculations, and email filtering.

**Architecture:** Incremental extension of existing tables, types, and components. No new tables. Settings restructured into tabs. Operation Profile redesigned with 6-step progress bar. All new fields have defaults so existing data is non-breaking.

**Tech Stack:** TypeScript, React, Tailwind CSS, Firebase/Firestore, SQLite (better-sqlite3), jsPDF, Google Maps Directions API, Gmail API

**Spec:** `docs/superpowers/specs/2026-03-14-feature-parity-design.md`

---

## File Map

### New Files (Components)
| File | Responsibility |
|------|---------------|
| `renderer/src/components/InspectionProgressBar.tsx` | 6-step progress bar with icons and click handlers |
| `renderer/src/components/StepModal.tsx` | Reusable modal for Prep/Inspected/Report steps (checklist + hours) |
| `renderer/src/components/InvoiceEditor.tsx` | Full editable invoice view with line items |
| `renderer/src/components/InvoiceEmailModal.tsx` | Gmail compose with agency template pre-fill |
| `renderer/src/components/NearbyOperatorsModal.tsx` | Distance-sorted operator list modal |
| `renderer/src/components/StickyNote.tsx` | Quick note/task creation widget |
| `renderer/src/components/UnifiedActivityFeed.tsx` | Combined notes/tasks/emails/activity feed |
| `renderer/src/components/OnboardingWizard.tsx` | Multi-step first-run setup wizard |
| `renderer/src/components/SignatureEditor.tsx` | Rich HTML email signature editor with live preview |
| `renderer/src/components/ChecklistEditor.tsx` | Checklist item management (add/remove/reorder) |
| `renderer/src/components/RateConfigSection.tsx` | Reusable rate configuration form |
| `renderer/src/components/AgencySettingsTab.tsx` | Full agency settings panel |
| `renderer/src/components/BusinessProfileTab.tsx` | My Business settings panel |

### New Files (Utilities)
| File | Responsibility |
|------|---------------|
| `renderer/src/utils/distanceUtils.ts` | Google Maps Directions API distance/duration calculation (separate from geocodingUtils.ts which handles address-to-coordinates) |
| `renderer/src/utils/invoiceCalculator.ts` | Rate resolution + line item calculation logic |
| `renderer/src/utils/templateRenderer.ts` | Email template variable substitution |

### Modified Files
| File | Changes |
|------|---------|
| `main/schema.ts` | New columns on agencies, operations, inspections, notes. Migration logic. |
| `shared/src/types.ts` | Updated interfaces for Agency, Inspection, Invoice, Operation. New types for rate configs and checklists. |
| `renderer/src/pages/Settings.tsx` | Complete restructure to tabbed layout |
| `renderer/src/pages/OperationProfile.tsx` | New header, progress bar, distance, nearby, sticky note, unified feed |
| `renderer/src/pages/Invoices.tsx` | New status filters, updated table |
| `renderer/src/pages/Reports.tsx` | Mileage summary, cash-basis revenue |
| `renderer/src/pages/InspectionProfile.tsx` | Updated hour fields |
| `renderer/src/lib/pdfGenerator.ts` | Updated InvoiceData interface, mileage in tax PDF |
| `renderer/src/utils/geocodingUtils.ts` | No changes — distance calculation lives in new `distanceUtils.ts` |
| `renderer/src/components/Layout.tsx` | No nav changes needed (existing sidebar is fine) |

All paths relative to `/home/chrishoran/Desktop/DIOS/apps/desktop/`.

---

## Chunk 1: Data Layer Foundation

### Task 1: Update Type Definitions

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add new type interfaces for rate configs and checklists**

Add at the end of `types.ts` (after line 165):

```typescript
export interface ChecklistItem {
  item: string
  checked: boolean
}

export interface RateConfig {
  isFlatRate: boolean
  flatRateAmount: number
  flatRateIncludedHours: number
  flatRateOverageRate: number
  hourlyRate: number
  driveTimeHourlyRate: number
  mileageReimbursed: boolean
  mileageRate: number
  perDiemRate: number
}

export interface DefaultLineItem {
  name: string
  amount: number
}
```

- [ ] **Step 2: Update Agency interface**

Replace the existing Agency interface (lines 16-27) with:

```typescript
export interface Agency {
  id: string
  name: string
  billingAddress: string
  // Rate config (base rates)
  isFlatRate: boolean
  flatRateAmount: number
  flatRateIncludedHours: number
  flatRateOverageRate: number
  hourlyRate: number
  driveTimeHourlyRate: number
  mileageReimbursed: boolean
  mileageRate: number
  perDiemRate: number
  // Per-type rates
  perTypeRatesEnabled: boolean
  ratesByType: string // JSON: Record<string, RateConfig>
  operationTypes: string // JSON: string[]
  // Billing contact
  billingEmail: string
  billingContactName: string
  // Email template
  emailTemplateSubject: string
  emailTemplateBody: string
  // Checklists
  prepChecklistEnabled: boolean
  prepChecklistItems: string // JSON: ChecklistItem[]
  reportChecklistEnabled: boolean
  reportChecklistItems: string // JSON: ChecklistItem[]
  // Default line items
  defaultLineItems: string // JSON: DefaultLineItem[]
  // Drive
  driveFolderId?: string
  // Metadata
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
```

- [ ] **Step 3: Update Operation interface**

Replace the existing Operation interface (lines 29-43) with:

```typescript
export interface Operation {
  id: string
  name: string
  agencyId: string
  address: string
  contactName: string
  phone: string
  email: string
  status: 'active' | 'inactive'
  notes?: string
  quickNote?: string
  operationType: string
  clientId: string
  lat?: number
  lng?: number
  cachedDistanceMiles?: number
  cachedDriveTimeMinutes?: number
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
```

Note: `inspectionStatus` field removed — inspection's own `status` is the source of truth.

- [ ] **Step 4: Update Inspection interface**

Replace the existing Inspection interface (lines 45-67) with:

```typescript
export interface Inspection {
  id: string
  operationId: string
  date: string
  endDate?: string
  status: 'Scheduled' | 'Prep' | 'Inspected' | 'Report' | 'Invoiced' | 'Paid' | 'Cancelled'
  // Hour tracking by phase
  prepHours: number
  onsiteHours: number
  reportHours: number
  // Legacy fields (retained for backward compat)
  baseHoursLog: number
  additionalHoursLog: number
  // Mileage
  milesDriven: number
  calculatedMileage: number
  calculatedDriveTime: number
  // Bundle
  bundleId?: string
  isBundled?: boolean
  totalTripDriveTime?: number
  totalTripStops?: number
  sharedDriveTime?: number
  // Expenses
  mealsAndExpenses?: number
  perDiemDays?: number
  customLineItemName?: string
  customLineItemAmount?: number
  linkedExpenses?: string[] | string
  // Notes
  notes?: string
  invoiceNotes?: string
  invoiceExceptions?: string
  // Checklists
  prepChecklistData: string // JSON: ChecklistItem[]
  reportChecklistData: string // JSON: ChecklistItem[]
  // Status
  reportCompleted?: boolean
  googleCalendarEventId?: string
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
```

- [ ] **Step 5: Update Invoice interface**

Replace the existing Invoice interface (lines 69-76) with:

```typescript
export interface Invoice {
  id: string
  inspectionId: string
  operationId: string
  operationName: string
  agencyId: string
  agencyName: string
  totalAmount: number
  pdfDriveId?: string
  status: 'Not Complete' | 'Sent' | 'Paid'
  date: string
  inspectionDate: string
  sentDate?: string
  paidDate?: string
  lineItems?: string // JSON: array of line items for the invoice editor
  createdAt?: any
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
```

- [ ] **Step 6: Update InvoiceData interface**

Replace the existing InvoiceData interface (lines 136-157) with a consolidated version:

```typescript
export interface InvoiceLineItem {
  name: string
  amount: number
  details?: string // e.g. "3.5 hrs @ $72/hr"
}

export interface InvoiceData {
  invoiceNumber: string
  date: string
  // Business info (from)
  businessName: string
  businessAddress: string
  businessPhone: string
  businessEmail: string
  ownerName: string
  // Agency (bill to)
  agencyName: string
  agencyAddress: string
  // Operation (service for)
  operationName: string
  operationAddress: string
  // Line items
  lineItems: InvoiceLineItem[]
  totalAmount: number
  notes?: string
}
```

- [ ] **Step 7: Add Note interface update**

Update the existing Note type or add `operationId`:

```typescript
export interface Note {
  id: string
  content: string
  operationId?: string
  createdAt: string
  updatedAt: string
  syncStatus: 'pending' | 'synced' | 'failed'
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat: update type definitions for feature parity — agencies, inspections, invoices"
```

---

### Task 2: Update SQLite Schema

**Files:**
- Modify: `apps/desktop/main/schema.ts`

- [ ] **Step 1: Update agencies table CREATE statement**

Replace the agencies CREATE TABLE (lines 3-16) to include all new columns with defaults:

```sql
CREATE TABLE IF NOT EXISTS agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billingAddress TEXT NOT NULL DEFAULT '',
  isFlatRate INTEGER NOT NULL DEFAULT 0,
  flatRateAmount REAL NOT NULL DEFAULT 0,
  flatRateIncludedHours REAL NOT NULL DEFAULT 0,
  flatRateOverageRate REAL NOT NULL DEFAULT 0,
  hourlyRate REAL NOT NULL DEFAULT 0,
  driveTimeHourlyRate REAL NOT NULL DEFAULT 0,
  mileageReimbursed INTEGER NOT NULL DEFAULT 0,
  mileageRate REAL NOT NULL DEFAULT 0,
  perDiemRate REAL DEFAULT 0,
  perTypeRatesEnabled INTEGER NOT NULL DEFAULT 0,
  ratesByType TEXT NOT NULL DEFAULT '{}',
  operationTypes TEXT NOT NULL DEFAULT '["crop","handler"]',
  billingEmail TEXT NOT NULL DEFAULT '',
  billingContactName TEXT NOT NULL DEFAULT '',
  emailTemplateSubject TEXT NOT NULL DEFAULT '{operatorName} Invoice',
  emailTemplateBody TEXT NOT NULL DEFAULT 'Hey {agencyContact},

Here is the invoice for the completed inspection for {operatorName}.

Please let me know if you have any questions.

{signature}',
  prepChecklistEnabled INTEGER NOT NULL DEFAULT 1,
  prepChecklistItems TEXT NOT NULL DEFAULT '["Prep complete"]',
  reportChecklistEnabled INTEGER NOT NULL DEFAULT 1,
  reportChecklistItems TEXT NOT NULL DEFAULT '["Report complete"]',
  defaultLineItems TEXT NOT NULL DEFAULT '[]',
  driveFolderId TEXT DEFAULT NULL,
  updatedAt TEXT NOT NULL DEFAULT '',
  syncStatus TEXT NOT NULL DEFAULT 'pending'
)
```

- [ ] **Step 2: Update operations table — add new columns**

Add after the existing columns (around line 30):

```sql
operationType TEXT NOT NULL DEFAULT '',
clientId TEXT NOT NULL DEFAULT '',
cachedDistanceMiles REAL DEFAULT NULL,
cachedDriveTimeMinutes REAL DEFAULT NULL,
```

Remove the `inspectionStatus` column from the CREATE statement.

- [ ] **Step 3: Update inspections table — add new columns**

Add after the existing columns (around line 55):

```sql
prepHours REAL NOT NULL DEFAULT 0,
onsiteHours REAL NOT NULL DEFAULT 0,
reportHours REAL NOT NULL DEFAULT 0,
prepChecklistData TEXT NOT NULL DEFAULT '[]',
reportChecklistData TEXT NOT NULL DEFAULT '[]',
calculatedMileage REAL NOT NULL DEFAULT 0,
calculatedDriveTime REAL NOT NULL DEFAULT 0,
```

- [ ] **Step 4: Update invoices table — add new columns and change default status**

Change the `status` column default from `'Unpaid'` to `'Not Complete'` in the CREATE TABLE statement.

Add after the existing columns (around line 73):

```sql
sentDate TEXT DEFAULT NULL,
paidDate TEXT DEFAULT NULL,
lineItems TEXT DEFAULT NULL,
```

Also ensure the invoices table CREATE statement includes `operationId`, `operationName`, `agencyName`, `inspectionDate`, `date`, and `createdAt` columns if they are missing from the SQLite schema (they may currently only exist in Firestore documents). Add as:

```sql
operationId TEXT NOT NULL DEFAULT '',
operationName TEXT NOT NULL DEFAULT '',
agencyName TEXT NOT NULL DEFAULT '',
date TEXT NOT NULL DEFAULT '',
inspectionDate TEXT NOT NULL DEFAULT '',
createdAt TEXT NOT NULL DEFAULT '',
```

- [ ] **Step 5: Update notes table — add operationId**

Add to the notes CREATE statement (around line 107):

```sql
operationId TEXT DEFAULT NULL,
```

- [ ] **Step 6: Add migration logic for existing data**

Add a migration function at the end of `schema.ts` that runs ALTER TABLE statements for existing databases. This handles the case where the DB already exists with the old schema:

```typescript
export function migrateSchema(db: any): void {
  const migrations = [
    // agencies new columns
    `ALTER TABLE agencies ADD COLUMN isFlatRate INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN flatRateAmount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN flatRateOverageRate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN hourlyRate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN driveTimeHourlyRate REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN mileageReimbursed INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN perTypeRatesEnabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE agencies ADD COLUMN ratesByType TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE agencies ADD COLUMN operationTypes TEXT NOT NULL DEFAULT '["crop","handler"]'`,
    `ALTER TABLE agencies ADD COLUMN billingEmail TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE agencies ADD COLUMN billingContactName TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE agencies ADD COLUMN emailTemplateSubject TEXT NOT NULL DEFAULT '{operatorName} Invoice'`,
    `ALTER TABLE agencies ADD COLUMN emailTemplateBody TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE agencies ADD COLUMN prepChecklistEnabled INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE agencies ADD COLUMN prepChecklistItems TEXT NOT NULL DEFAULT '["Prep complete"]'`,
    `ALTER TABLE agencies ADD COLUMN reportChecklistEnabled INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE agencies ADD COLUMN reportChecklistItems TEXT NOT NULL DEFAULT '["Report complete"]'`,
    `ALTER TABLE agencies ADD COLUMN defaultLineItems TEXT NOT NULL DEFAULT '[]'`,
    // operations new columns
    `ALTER TABLE operations ADD COLUMN operationType TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE operations ADD COLUMN clientId TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE operations ADD COLUMN cachedDistanceMiles REAL DEFAULT NULL`,
    `ALTER TABLE operations ADD COLUMN cachedDriveTimeMinutes REAL DEFAULT NULL`,
    // inspections new columns
    `ALTER TABLE inspections ADD COLUMN prepHours REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE inspections ADD COLUMN onsiteHours REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE inspections ADD COLUMN reportHours REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE inspections ADD COLUMN prepChecklistData TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE inspections ADD COLUMN reportChecklistData TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE inspections ADD COLUMN calculatedMileage REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE inspections ADD COLUMN calculatedDriveTime REAL NOT NULL DEFAULT 0`,
    // agencies columns that may already exist but need to be ensured
    `ALTER TABLE agencies ADD COLUMN driveFolderId TEXT DEFAULT NULL`,
    // invoices new columns
    `ALTER TABLE invoices ADD COLUMN sentDate TEXT DEFAULT NULL`,
    `ALTER TABLE invoices ADD COLUMN paidDate TEXT DEFAULT NULL`,
    `ALTER TABLE invoices ADD COLUMN lineItems TEXT DEFAULT NULL`,
    `ALTER TABLE invoices ADD COLUMN operationId TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE invoices ADD COLUMN operationName TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE invoices ADD COLUMN agencyName TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE invoices ADD COLUMN date TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE invoices ADD COLUMN inspectionDate TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE invoices ADD COLUMN createdAt TEXT NOT NULL DEFAULT ''`,
    // notes new column
    `ALTER TABLE notes ADD COLUMN operationId TEXT DEFAULT NULL`,
  ]

  for (const sql of migrations) {
    try {
      db.exec(sql)
    } catch (e: any) {
      // Ignore "duplicate column" errors — column already exists
      if (!e.message?.includes('duplicate column')) {
        console.error('Migration error:', e.message)
      }
    }
  }

  // Data migration: map old agency rate fields to new structure
  try {
    db.exec(`
      UPDATE agencies SET
        flatRateAmount = COALESCE(flatRateBaseAmount, 0),
        flatRateOverageRate = COALESCE(additionalHourlyRate, 0),
        driveTimeHourlyRate = COALESCE(travelTimeHourlyRate, 0),
        mileageReimbursed = CASE WHEN COALESCE(mileageRate, 0) > 0 THEN 1 ELSE 0 END,
        isFlatRate = CASE WHEN COALESCE(flatRateBaseAmount, 0) > 0 THEN 1 ELSE 0 END
      WHERE isFlatRate = 0 AND COALESCE(flatRateBaseAmount, 0) > 0
    `)
  } catch (e: any) {
    // Old columns may not exist in fresh installs
    if (!e.message?.includes('no such column')) {
      console.error('Rate migration error:', e.message)
    }
  }

  // Data migration: map old invoice statuses
  try {
    db.exec(`UPDATE invoices SET status = 'Sent' WHERE status = 'Unpaid'`)
    db.exec(`UPDATE invoices SET paidDate = date WHERE status = 'Paid' AND paidDate IS NULL`)
  } catch (e: any) {
    console.error('Invoice status migration error:', e.message)
  }

  // Data migration: map old inspection statuses
  try {
    db.exec(`UPDATE inspections SET status = 'Scheduled' WHERE status = 'In Progress'`)
    db.exec(`UPDATE inspections SET status = 'Paid' WHERE status = 'Completed'`)
  } catch (e: any) {
    console.error('Inspection status migration error:', e.message)
  }
}
```

- [ ] **Step 7: Call migrateSchema from database initialization**

In `apps/desktop/main/database.ts`, call `migrateSchema(db)` after the CREATE TABLE statements run.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/main/schema.ts apps/desktop/main/database.ts
git commit -m "feat: update SQLite schema with new columns and migration logic"
```

---

### Task 3: Create Utility Modules

**Files:**
- Create: `apps/desktop/renderer/src/utils/invoiceCalculator.ts`
- Create: `apps/desktop/renderer/src/utils/templateRenderer.ts`
- Create: `apps/desktop/renderer/src/utils/distanceUtils.ts`

- [ ] **Step 1: Create invoiceCalculator.ts**

```typescript
import type { Agency, Inspection, Operation, RateConfig, InvoiceLineItem, DefaultLineItem } from '@dios/shared'

function resolveRates(agency: Agency, operationType: string): RateConfig {
  if (agency.perTypeRatesEnabled && operationType) {
    const byType: Record<string, RateConfig> = JSON.parse(agency.ratesByType || '{}')
    if (byType[operationType]) {
      return byType[operationType]
    }
  }
  return {
    isFlatRate: agency.isFlatRate,
    flatRateAmount: agency.flatRateAmount,
    flatRateIncludedHours: agency.flatRateIncludedHours,
    flatRateOverageRate: agency.flatRateOverageRate,
    hourlyRate: agency.hourlyRate,
    driveTimeHourlyRate: agency.driveTimeHourlyRate,
    mileageReimbursed: agency.mileageReimbursed,
    mileageRate: agency.mileageRate,
    perDiemRate: agency.perDiemRate,
  }
}

function roundToNearestHalfHour(minutes: number): number {
  return Math.ceil(minutes / 30) * 0.5
}

export function calculateInvoiceLineItems(
  inspection: Inspection,
  agency: Agency,
  operation: Operation,
  linkedExpenseTotal: number
): { lineItems: InvoiceLineItem[]; total: number } {
  const rates = resolveRates(agency, operation.operationType)
  const lineItems: InvoiceLineItem[] = []
  const totalHours = inspection.prepHours + inspection.onsiteHours + inspection.reportHours

  // Base charge
  if (rates.isFlatRate) {
    lineItems.push({
      name: 'Inspection Fee (Flat Rate)',
      amount: rates.flatRateAmount,
      details: `Up to ${rates.flatRateIncludedHours} hrs included`,
    })
    if (totalHours > rates.flatRateIncludedHours) {
      const overageHours = totalHours - rates.flatRateIncludedHours
      lineItems.push({
        name: 'Additional Hours',
        amount: overageHours * rates.flatRateOverageRate,
        details: `${overageHours} hrs @ $${rates.flatRateOverageRate}/hr`,
      })
    }
  } else {
    lineItems.push({
      name: 'Inspection Fee',
      amount: totalHours * rates.hourlyRate,
      details: `${totalHours} hrs @ $${rates.hourlyRate}/hr`,
    })
  }

  // Drive time
  const driveMinutes = inspection.calculatedDriveTime || 0
  if (driveMinutes > 0 && rates.driveTimeHourlyRate > 0) {
    let driveHours = roundToNearestHalfHour(driveMinutes)
    if (inspection.isBundled && inspection.totalTripStops && inspection.totalTripStops > 0) {
      driveHours = driveHours / inspection.totalTripStops
    }
    lineItems.push({
      name: 'Drive Time',
      amount: driveHours * rates.driveTimeHourlyRate,
      details: `${driveHours} hrs @ $${rates.driveTimeHourlyRate}/hr`,
    })
  }

  // Mileage (only if agency reimburses)
  if (rates.mileageReimbursed && rates.mileageRate > 0) {
    let miles = inspection.calculatedMileage || 0
    if (inspection.isBundled && inspection.totalTripStops && inspection.totalTripStops > 0) {
      miles = miles / inspection.totalTripStops
    }
    if (miles > 0) {
      lineItems.push({
        name: 'Mileage',
        amount: miles * rates.mileageRate,
        details: `${miles.toFixed(1)} mi @ $${rates.mileageRate}/mi`,
      })
    }
  }

  // Per diem
  if (inspection.perDiemDays && inspection.perDiemDays > 0 && rates.perDiemRate > 0) {
    lineItems.push({
      name: 'Per Diem',
      amount: inspection.perDiemDays * rates.perDiemRate,
      details: `${inspection.perDiemDays} days @ $${rates.perDiemRate}/day`,
    })
  }

  // Meals & expenses
  if (inspection.mealsAndExpenses && inspection.mealsAndExpenses > 0) {
    lineItems.push({
      name: 'Meals & Expenses',
      amount: inspection.mealsAndExpenses,
    })
  }

  // Agency default line items
  const defaults: DefaultLineItem[] = JSON.parse(agency.defaultLineItems || '[]')
  for (const item of defaults) {
    lineItems.push({ name: item.name, amount: item.amount })
  }

  // Linked expenses total
  if (linkedExpenseTotal > 0) {
    lineItems.push({
      name: 'Linked Expenses',
      amount: linkedExpenseTotal,
    })
  }

  // Custom line item
  if (inspection.customLineItemName && inspection.customLineItemAmount) {
    lineItems.push({
      name: inspection.customLineItemName,
      amount: inspection.customLineItemAmount,
    })
  }

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0)
  return { lineItems, total }
}
```

- [ ] **Step 2: Create templateRenderer.ts**

```typescript
interface TemplateVariables {
  agencyContact: string
  agencyName: string
  operatorName: string
  inspectionDate: string
  invoiceNumber: string
  totalAmount: string
  signature: string
}

export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template
    .replace(/\{agencyContact\}/g, variables.agencyContact)
    .replace(/\{agencyName\}/g, variables.agencyName)
    .replace(/\{operatorName\}/g, variables.operatorName)
    .replace(/\{inspectionDate\}/g, variables.inspectionDate)
    .replace(/\{invoiceNumber\}/g, variables.invoiceNumber)
    .replace(/\{totalAmount\}/g, variables.totalAmount)
    .replace(/\{signature\}/g, variables.signature)
}
```

- [ ] **Step 3: Create distanceUtils.ts**

```typescript
interface DistanceResult {
  distanceMiles: number
  durationMinutes: number
}

export async function calculateDistance(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<DistanceResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${apiKey}`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' || !data.routes?.length) {
      return null
    }

    const leg = data.routes[0].legs[0]
    const distanceMeters = leg.distance.value
    const durationSeconds = leg.duration.value

    // Round trip
    return {
      distanceMiles: (distanceMeters / 1609.344) * 2,
      durationMinutes: (durationSeconds / 60) * 2,
    }
  } catch (error) {
    console.error('Distance calculation failed:', error)
    return null
  }
}

export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`
}

export function formatDriveTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours} hrs`
  return `${hours} hrs ${mins} min`
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/utils/invoiceCalculator.ts apps/desktop/renderer/src/utils/templateRenderer.ts apps/desktop/renderer/src/utils/distanceUtils.ts
git commit -m "feat: add invoice calculator, template renderer, and distance utilities"
```

---

## Chunk 2: Settings Restructure

### Task 4: Create RateConfigSection Component

**Files:**
- Create: `apps/desktop/renderer/src/components/RateConfigSection.tsx`

- [ ] **Step 1: Create the component**

A reusable form section for configuring billing rates. Props accept rate values and onChange callbacks. Shows flat rate toggle, conditional fields, drive time rate, mileage toggle, per diem, and default line items.

Key structure:
- Flat rate toggle (yes/no buttons)
- If flat: amount, included hours, overage rate inputs
- If hourly: hourly rate input
- Drive time hourly rate input (always)
- Mileage reimbursed toggle
- If mileage reimbursed: mileage rate input
- Per diem rate input
- Default line items: list with name/amount + Add/Remove buttons

Use the existing form styling patterns from Settings.tsx:
- Labels: `text-xs font-bold text-stone-500 uppercase tracking-wider`
- Inputs: `bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A]`

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/RateConfigSection.tsx
git commit -m "feat: add RateConfigSection reusable billing rate form component"
```

---

### Task 5: Create ChecklistEditor Component

**Files:**
- Create: `apps/desktop/renderer/src/components/ChecklistEditor.tsx`

- [ ] **Step 1: Create the component**

Props:
- `enabled: boolean` — toggle on/off
- `onToggle: (enabled: boolean) => void`
- `items: string[]` — checklist item labels
- `onItemsChange: (items: string[]) => void`
- `title: string` — e.g. "Prep Checklist" or "Report Checklist"

Features:
- Enable/disable toggle at top
- When enabled: editable list of items
- Each item: text input with delete (X) button
- Drag handles for reorder (use simple up/down arrow buttons rather than drag library)
- "+ Add Item" button at bottom
- When disabled: grayed out with message "Checklist disabled for this agency"

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/ChecklistEditor.tsx
git commit -m "feat: add ChecklistEditor component for agency checklist configuration"
```

---

### Task 6: Create BusinessProfileTab Component

**Files:**
- Create: `apps/desktop/renderer/src/components/BusinessProfileTab.tsx`

- [ ] **Step 1: Create the component**

Reads/writes to system_config. Note: the `system_config` table uses `key` as its primary key (not `id`), so the standard `useDatabase` hook won't work directly. Instead, use direct Firestore access for web mode (`doc(db, 'users', uid, 'system_settings', 'config')` — a single document with all business profile fields) and direct SQLite queries for Electron mode (`window.electronAPI.db.query('SELECT value FROM system_config WHERE key = ?', [key])`). Wrap this in a `useSystemConfig()` custom hook that provides `get(key)` and `set(key, value)` methods.

Fields:
- Business Name, Owner Name, Title (row of 3)
- Address, City, State, Zip (address row)
- Phone, Email (row of 2)
- IRS Mileage Rate (number input, default 0.70)
- "Save" button that writes all values to system_config and geocodes the address to set homebaseLat/homebaseLng

Uses `geocodeAddress` from `geocodingUtils.ts` for homebase geocoding.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/BusinessProfileTab.tsx
git commit -m "feat: add BusinessProfileTab component for My Business settings"
```

---

### Task 7: Create SignatureEditor Component

**Files:**
- Create: `apps/desktop/renderer/src/components/SignatureEditor.tsx`

- [ ] **Step 1: Create the component**

A rich HTML editor for email signatures. Two panels side-by-side:
- Left: editable contentEditable div with toolbar (bold, italic, link, image URL)
- Right: live HTML preview

Keep it simple — use a contentEditable div with `execCommand` for basic formatting rather than pulling in a heavy library. The signature HTML is stored as a string in system_config.

Props:
- `value: string` — current HTML
- `onChange: (html: string) => void`

Auto-generate default from business profile fields when empty:
```html
<p><strong>{ownerName}</strong></p>
<p>{ownerTitle}</p>
<p>{businessName}</p>
<p>{businessPhone} | {businessEmail}</p>
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/SignatureEditor.tsx
git commit -m "feat: add SignatureEditor rich HTML editor component"
```

---

### Task 8: Create AgencySettingsTab Component

**Files:**
- Create: `apps/desktop/renderer/src/components/AgencySettingsTab.tsx`

- [ ] **Step 1: Create the component**

Full agency settings panel with sections:
1. **Billing Rates** — uses `RateConfigSection`
2. **Per-Type Rates Toggle** — when enabled, shows a `RateConfigSection` per operation type + "Add Type" button
3. **Billing Contact** — name and email inputs
4. **Email Template** — subject and body textareas with variable reference list
5. **Prep Checklist** — uses `ChecklistEditor`
6. **Report Checklist** — uses `ChecklistEditor`
7. **Drive Folder** — text input for Google Drive folder link
8. **Danger Zone** — delete agency button with confirmation modal

Props:
- `agency: Agency`
- `onSave: (agency: Agency) => void`
- `onDelete: (agencyId: string) => void`

Uses internal state for form edits, saves on explicit "Save Changes" button click.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/AgencySettingsTab.tsx
git commit -m "feat: add AgencySettingsTab full agency settings panel"
```

---

### Task 9: Restructure Settings Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Replace Settings.tsx with tabbed layout**

Complete rewrite of Settings.tsx. New structure:

**Tab bar** at top:
- "My Business" tab (always first)
- One tab per agency (dynamically generated from agencies list)
- "+ Add Agency" tab (opens new agency form)
- "Data & Integrations" tab (last)

**Tab content:**
- My Business → renders `BusinessProfileTab` + `SignatureEditor`
- Agency tab → renders `AgencySettingsTab` for that agency
- Add Agency → renders empty `AgencySettingsTab` with save-as-new logic
- Data & Integrations → existing local folder sync, email whitelist, backup/reset sections (extracted from current Settings.tsx)

Remove the old agency modal entirely. Each agency now has its own full tab.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/Settings.tsx
git commit -m "feat: restructure Settings page into tabbed layout with per-agency tabs"
```

---

## Chunk 3: Operation Profile Redesign

### Task 10: Create InspectionProgressBar Component

**Files:**
- Create: `apps/desktop/renderer/src/components/InspectionProgressBar.tsx`

- [ ] **Step 1: Create the component**

6-step progress bar matching the legacy app screenshot:

Steps: Scheduled → Prep → Inspected → Report → Invoiced → Paid

Each step has:
- Icon (use Lucide icons: CalendarCheck, ClipboardCheck, Search, FileText, Receipt, Coins)
- Label below icon
- States: empty (stone-200 border), current (orange border + ring), complete (checkmark + orange)
- Connected by `>` arrow separators between steps

Props:
- `currentStatus: string` — current inspection status
- `onStepClick: (step: string) => void` — fires when a clickable step is clicked
- `disabled?: boolean` — when no inspection exists for this year

Styling:
- Icons in circles: `w-12 h-12 rounded-full border-2 flex items-center justify-center`
- Completed: `border-[#D49A6A] text-[#D49A6A]` with Check icon overlay
- Current: `border-[#D49A6A] ring-4 ring-[#D49A6A]/10`
- Future: `border-stone-200 text-stone-400`
- Labels: `text-xs font-medium mt-1`

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/InspectionProgressBar.tsx
git commit -m "feat: add InspectionProgressBar 6-step progress component"
```

---

### Task 11: Create StepModal Component

**Files:**
- Create: `apps/desktop/renderer/src/components/StepModal.tsx`

- [ ] **Step 1: Create the component**

Reusable modal for Prep, Inspected, and Report workflow steps.

Props:
- `step: 'Prep' | 'Inspected' | 'Report'`
- `checklistItems: ChecklistItem[]` — items to show (empty array if checklist disabled)
- `checklistEnabled: boolean`
- `onComplete: (data: { hours: number; checklist: ChecklistItem[] }) => void`
- `onClose: () => void`
- `isOpen: boolean`

Layout (uses existing modal pattern from OperationProfile.tsx):
- Title: "Complete Prep" / "Complete Inspection" / "Complete Report"
- If checklist enabled: list of checkbox items
- Hours input: labeled "Prep Hours" / "Onsite Hours" / "Report Writing Hours"
- "Complete" button — disabled until all checklist items checked (if enabled) and hours > 0
- "Cancel" button

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/StepModal.tsx
git commit -m "feat: add StepModal component for inspection workflow step completion"
```

---

### Task 12: Create StickyNote Component

**Files:**
- Create: `apps/desktop/renderer/src/components/StickyNote.tsx`

- [ ] **Step 1: Create the component**

Quick note/task creation widget for the Operation Profile Overview tab.

Props:
- `operationId: string`
- `onNoteSaved: () => void` — callback to refresh feed

Features:
- Text input area (2 lines, expandable)
- Toggle: "Note" vs "Task" (two small buttons)
- If Task: due date picker appears
- Submit button (arrow icon)
- On submit: saves to notes table (with operationId) or tasks table (with operationId)
- Clears input after save

Styling: light background card, subtle border, compact form.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/StickyNote.tsx
git commit -m "feat: add StickyNote quick note/task widget"
```

---

### Task 13: Create UnifiedActivityFeed Component

**Files:**
- Create: `apps/desktop/renderer/src/components/UnifiedActivityFeed.tsx`

- [ ] **Step 1: Create the component**

Combined chronological feed of notes, tasks, emails, and activity log entries.

Props:
- `operationId: string`
- `operationEmail: string` — for email thread filtering

Data sources (all fetched inside component):
- Notes where `operationId` matches
- Tasks where `operationId` matches
- Operation activities where `operationId` matches
- Gmail threads where operator email is in to/from (uses Gmail API query `from:{email} OR to:{email}`)

Each entry rendered with:
- Icon by type (StickyNote, CheckSquare, Mail, Activity)
- Timestamp (relative: "2 hours ago", "Mar 10")
- Content preview (truncated to 2 lines)
- Type badge

Sorted newest first. Emails are clickable → opens in Email page.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/UnifiedActivityFeed.tsx
git commit -m "feat: add UnifiedActivityFeed combined activity/notes/email feed"
```

---

### Task 14: Create NearbyOperatorsModal Component

**Files:**
- Create: `apps/desktop/renderer/src/components/NearbyOperatorsModal.tsx`

- [ ] **Step 1: Create the component**

Modal showing all operations sorted by distance from the current operation.

Props:
- `isOpen: boolean`
- `onClose: () => void`
- `currentOperation: Operation`
- `operations: Operation[]` — all other operations

Calculation:
- For each operation with lat/lng, calculate straight-line distance using Haversine formula (no API call needed for sorting — save API calls for exact routing)
- Sort by distance ascending

List items show:
- Operation name
- Agency badge (colored)
- Distance: "12.3 mi"
- Estimated drive time: "~18 min" (rough estimate: miles * 1.5 min)
- Click → navigates to that operation's profile (using React Router)

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/NearbyOperatorsModal.tsx
git commit -m "feat: add NearbyOperatorsModal for nearby operator discovery"
```

---

### Task 15: Redesign OperationProfile Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/OperationProfile.tsx`

- [ ] **Step 1: Redesign header area**

Replace the current header (lines ~450-520) with new layout matching the legacy app:

**Header structure:**
- Back arrow button (top-left)
- Operation name with edit pencil icon
- Client ID display (from `operation.clientId`), agency badge, operation type badge
- Contact info: name, address, phone, email
- Description/notes text

**Top-right cluster:**
- "+ Schedule" button (primary brown, triggers schedule modal)
- "Maps" button (opens Google Maps in new tab for operation address)
- "Nearby" button (opens NearbyOperatorsModal)
- Distance display: "62.4 mi · 1.5 hrs" (from `cachedDistanceMiles` and `cachedDriveTimeMinutes`)
- Year selector: buttons for 2026+ years

- [ ] **Step 2: Remove all `inspectionStatus` references and add InspectionProgressBar**

Remove all references to `operation.inspectionStatus` (lines 29, 99, 421 and the `INSPECTION_STEPS` array at lines 34-41). The progress bar state now comes from the **inspection record's `status` field**, not the operation. Load the current year's inspection for this operation and derive progress from `inspection.status`.

Replace the existing progress bar (lines 488-520) with the new `InspectionProgressBar` component.

Wire up step clicks:
- Scheduled → open schedule modal (existing)
- Prep → open StepModal with prep checklist
- Inspected → open StepModal with onsite hours
- Report → open StepModal with report checklist + hours
- Invoiced → navigate to invoice editor
- Paid → mark invoice as paid

Load the current year's inspection to determine progress bar state.

- [ ] **Step 3: Restructure tabs — Overview tab with StickyNote + UnifiedActivityFeed**

Replace the current 3-column layout with a tab-based layout:

**Tab: Overview**
- StickyNote widget at top
- UnifiedActivityFeed below

**Tab: Inspections**
- List of inspections for this operation (year-filtered)

**Tab: Documents**
- Existing document upload + list (unchanged)

**Tab: Activity**
- Full activity log (existing, unchanged)

- [ ] **Step 4: Add distance calculation on load**

On component mount or when operation changes:
1. Check if `cachedDistanceMiles` and `cachedDriveTimeMinutes` exist
2. If not, load homebase coordinates from system_config
3. Call `calculateDistance()` from `distanceUtils.ts`
4. Save result to operation record (`cachedDistanceMiles`, `cachedDriveTimeMinutes`)
5. Display in header

- [ ] **Step 5: Wire up StepModal for workflow steps**

Add state and handlers for StepModal:
- `activeStep` state to track which step modal is open
- On step complete: update inspection record with hours + checklist data, advance status
- Log activity for each step completion

- [ ] **Step 6: Fix Gmail CRM panel email filtering**

Update the email thread loading (lines 230-253) to only query for the operator's email:
- Gmail API query: `from:{operationEmail} OR to:{operationEmail}`
- Remove agency emails and whitelisted emails from the query

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/renderer/src/pages/OperationProfile.tsx
git commit -m "feat: redesign OperationProfile with progress bar, distance, nearby, sticky note, unified feed"
```

---

## Chunk 4: Invoice Editor & Emailing

### Task 16: Create InvoiceEditor Component

**Files:**
- Create: `apps/desktop/renderer/src/components/InvoiceEditor.tsx`

- [ ] **Step 1: Create the component**

Full-page or large modal invoice editing view.

Props:
- `inspection: Inspection`
- `operation: Operation`
- `agency: Agency`
- `onSave: (invoice: Invoice) => void`
- `onClose: () => void`
- `isOpen: boolean`

Layout:
- Header: "Invoice Preview" with invoice number (auto-generated: `INV-{timestamp}`)
- Two-column top section:
  - Left: "Bill To" (agency name, address, billing contact)
  - Right: "Service For" (operation name, address)
- Line items table:
  - Pre-populated using `calculateInvoiceLineItems()` from `invoiceCalculator.ts`
  - Each row: name (editable), details (read-only), amount (editable), delete button
  - "+ Add Line Item" row at bottom
- Notes textarea
- Total row (auto-calculated from line items)
- Action buttons:
  - "Print / Download PDF" → calls `generateInvoicePdf()` with the line items
  - "Email to Agency" → opens InvoiceEmailModal

State: lineItems array, notes, all editable. Recalculates total on any change.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/InvoiceEditor.tsx
git commit -m "feat: add InvoiceEditor editable invoice view with line items"
```

---

### Task 17: Create InvoiceEmailModal Component

**Files:**
- Create: `apps/desktop/renderer/src/components/InvoiceEmailModal.tsx`

- [ ] **Step 1: Create the component**

Gmail compose modal pre-filled from agency email template.

Props:
- `isOpen: boolean`
- `onClose: () => void`
- `agency: Agency`
- `operation: Operation`
- `invoiceNumber: string`
- `totalAmount: number`
- `inspectionDate: string`
- `pdfBlob: Blob` — generated invoice PDF to attach
- `signatureHtml: string` — from system_config
- `onSent: () => void` — callback after successful send

On open:
1. Render agency's `emailTemplateSubject` and `emailTemplateBody` using `renderTemplate()`
2. Pre-fill To field with agency's `billingEmail`
3. Attach the PDF blob as `{invoiceNumber}.pdf`

Layout:
- To field (pre-filled, editable)
- Subject field (pre-filled from template, editable)
- Body textarea (pre-filled from template, editable)
- Attachment chip showing PDF filename
- "Send" and "Cancel" buttons

On send:
1. Build RFC 2822 email with multipart/mixed (reuse pattern from Email.tsx lines 167-249)
2. Send via Gmail API
3. Call `onSent()` to update invoice status to 'Sent'
4. Log activity on operation

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/InvoiceEmailModal.tsx
git commit -m "feat: add InvoiceEmailModal Gmail compose with agency template"
```

---

### Task 18: Update pdfGenerator.ts

**Files:**
- Modify: `apps/desktop/renderer/src/lib/pdfGenerator.ts`

- [ ] **Step 1: Update generateInvoicePdf to use new InvoiceData interface**

Replace the existing function (lines 35-155) to work with the new `InvoiceData` interface that uses `lineItems: InvoiceLineItem[]` instead of individual fields.

Key changes:
- Header section: add business info (from, name, address, phone, email)
- Bill To section: agency name + address
- Service For section: operation name + address
- Line items: iterate over `lineItems` array, rendering name, details, amount per row
- Total: use `totalAmount`
- Notes section: use `notes`

- [ ] **Step 2: Update generateTaxReportPdf to include mileage deduction**

Add a new section after Expenses in the tax report:

- "Mileage Deduction" heading
- Total miles driven
- IRS standard mileage rate
- Total deduction amount
- This data comes via an updated `TaxReportData` interface (add `totalMiles`, `irsMileageRate`, `mileageDeduction` fields)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/lib/pdfGenerator.ts
git commit -m "feat: update PDF generator for new invoice/tax line item structure"
```

---

### Task 19: Update Invoices Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Invoices.tsx`

- [ ] **Step 1: Update status filters**

Replace the filter buttons (lines 209-223) with new statuses:
- All | Not Complete | Sent | Paid

"Not Complete" tab requires a **separate data fetch from the inspections table** (not the invoices table). Query inspections where `status NOT IN ('Invoiced', 'Paid', 'Cancelled')` and display them as in-progress inspection rows (with operation name, date, current step). This means the Invoices page needs a second `useDatabase({ table: 'inspections' })` hook or a separate Firestore query alongside the existing invoices query. Join with operations data to show operation name and agency.

"Sent" and "Paid" tabs filter invoice records by status as before.

- [ ] **Step 2: Update status toggle button**

Replace the status toggle (lines 271-280) with a dropdown or button:
- "Sent" → "Mark Paid" button (sets status to 'Paid', records `paidDate`)
- "Paid" → shows paid date badge

- [ ] **Step 3: Add "View Invoice" action**

Add a button in the actions column that opens the InvoiceEditor for the associated inspection (for editing/re-sending).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/pages/Invoices.tsx
git commit -m "feat: update Invoices page with Not Complete/Sent/Paid statuses"
```

---

## Chunk 5: Reports, Onboarding & Finishing

### Task 20: Update Reports Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Reports.tsx`

- [ ] **Step 1: Add mileage summary section**

Add a new section above or below the existing charts:

- "Mileage Summary" card with:
  - Total miles driven (sum of all `calculatedMileage` from inspections in selected year)
  - IRS mileage rate (from system_config `irsMileageRate`)
  - Total mileage deduction: `totalMiles * irsMileageRate`
  - Formatted as a small KPI card with three values

- [ ] **Step 2: Update revenue calculations to cash basis**

Change the revenue data fetching (lines 66-105) to filter by `paidDate` year instead of `date` year:
- Only include invoices where `status === 'Paid'` and `paidDate` falls in the selected year
- Monthly revenue chart uses the month from `paidDate`

- [ ] **Step 3: Update Schedule C export**

Update the Schedule C PDF generation (lines 156-189) to:
- Use cash-basis revenue (paidDate year)
- Pass mileage data to `generateTaxReportPdf()`:
  - `totalMiles`: sum of `calculatedMileage` from all inspections in the year
  - `irsMileageRate`: from system_config
  - `mileageDeduction`: totalMiles * irsMileageRate

- [ ] **Step 4: Update year selector**

Change the available years (lines 54-55) to show only 2026 and forward:
```typescript
const currentYear = new Date().getFullYear()
const availableYears = Array.from({ length: 5 }, (_, i) => 2026 + i).filter(y => y <= currentYear + 1)
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/pages/Reports.tsx
git commit -m "feat: add mileage deduction to reports, cash-basis revenue, year filter update"
```

---

### Task 21: Create OnboardingWizard Component

**Files:**
- Create: `apps/desktop/renderer/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Create the component**

Multi-step modal wizard shown on first launch.

Steps:
1. **Welcome** — business name, owner name, title inputs
2. **Address** — address, city, state, zip, phone, email inputs
3. **Email Signature** — SignatureEditor component with auto-generated default from step 1+2
4. **First Agency** — agency name, billing contact, billing email, rate config (using RateConfigSection)
5. **Done** — summary + "Get Started" button

Navigation: Back / Next buttons. Skip link on each step.

On complete (or skip all):
- Save business profile to system_config
- Geocode address for homebase lat/lng
- Save email signature to system_config
- Create first agency record (if filled)
- Set `onboardingCompleted: true` in system_config

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/components/OnboardingWizard.tsx
git commit -m "feat: add OnboardingWizard multi-step first-run setup"
```

---

### Task 22: Wire OnboardingWizard into App

**Files:**
- Modify: `apps/desktop/renderer/src/App.tsx` (the root component, which already handles SetupWizard display logic)

- [ ] **Step 1: Add onboarding check after existing setup check**

In App.tsx, after the existing `hasConfig` / SetupWizard check (around lines 56-68), add a second gate for onboarding. When Firebase config exists but `onboardingCompleted` is false, show the OnboardingWizard.

```typescript
const [showOnboarding, setShowOnboarding] = useState(false)

useEffect(() => {
  // Check system_config for onboardingCompleted (use useSystemConfig hook)
  const completed = await getSystemConfig('onboardingCompleted')
  if (completed !== 'true') {
    setShowOnboarding(true)
  }
}, [])
```

Render `<OnboardingWizard isOpen={showOnboarding} onComplete={() => setShowOnboarding(false)} />` inside the authenticated layout, before the main content.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/App.tsx
git commit -m "feat: show OnboardingWizard on first app launch"
```

---

### Task 23: Update InspectionProfile Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

- [ ] **Step 1: Add new hour fields to the form**

Add prepHours, onsiteHours, reportHours inputs alongside (or replacing) the existing baseHoursLog and additionalHoursLog inputs in the Time Log section (lines 740-770).

Display the new fields but keep legacy fields visible if they have non-zero values (backward compatibility).

- [ ] **Step 2: Update invoice generation to use new calculator**

Replace the inline calculation logic (lines 226-273, 294-407) with a call to `calculateInvoiceLineItems()` from `invoiceCalculator.ts`. Build the `InvoiceData` from the result and generate PDF.

- [ ] **Step 3: Update status dropdown**

Replace the status options (line 22 area) with the new enum:
```typescript
const STATUSES = ['Scheduled', 'Prep', 'Inspected', 'Report', 'Invoiced', 'Paid', 'Cancelled']
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/pages/InspectionProfile.tsx
git commit -m "feat: update InspectionProfile with new hour fields and invoice calculator"
```

---

### Task 24: Update Sync Engine

**Files:**
- Modify: `apps/desktop/main/syncEngine.ts`

- [ ] **Step 1: Update BOOLEAN_FIELDS set**

The sync engine at line 25 has a hardcoded set:
```typescript
const BOOLEAN_FIELDS = new Set(['isBundled', 'reportCompleted'])
```

Update to include all new boolean fields stored as INTEGER in SQLite:
```typescript
const BOOLEAN_FIELDS = new Set([
  'isBundled', 'reportCompleted',
  'isFlatRate', 'mileageReimbursed', 'perTypeRatesEnabled',
  'prepChecklistEnabled', 'reportChecklistEnabled',
])
```

Without this, SQLite integer values (0/1) will sync to Firestore as integers instead of booleans.

- [ ] **Step 2: Verify JSON string fields sync as stringValue**

JSON fields (`ratesByType`, `prepChecklistItems`, `reportChecklistItems`, `operationTypes`, `defaultLineItems`, `prepChecklistData`, `reportChecklistData`, `lineItems`) are TEXT in SQLite and should sync as `stringValue` in Firestore. The existing `pushToFirestore` function handles strings generically — verify no special handling is needed.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/main/syncEngine.ts
git commit -m "fix: add new boolean fields to sync engine BOOLEAN_FIELDS set"
```

---

### Task 25: Final Integration Testing

- [ ] **Step 1: Verify Settings page**

Open Settings. Verify:
- "My Business" tab shows and saves business profile
- Each agency has its own tab with full rate config
- Checklists are configurable
- Email templates are editable
- "+ Add Agency" creates a new agency tab

- [ ] **Step 2: Verify Operation Profile**

Open an operation. Verify:
- Progress bar shows 6 steps
- Distance displays from homebase
- "Nearby" button shows sorted operators
- Year selector works
- StickyNote creates notes/tasks
- UnifiedActivityFeed shows mixed entries
- Gmail panel only shows operator emails

- [ ] **Step 3: Verify inspection workflow**

Click through the workflow:
- Schedule → creates inspection, calendar event
- Prep → modal with checklist + hours, saves data
- Inspected → modal with onsite hours
- Report → modal with checklist + hours
- View Invoice → opens InvoiceEditor with pre-populated line items
- Edit line items, add custom items
- Print → generates PDF
- Email → pre-fills from agency template, sends, status → "Sent"
- Paid → marks invoice paid with paidDate

- [ ] **Step 4: Verify Invoices page**

Open Invoices. Verify:
- Not Complete / Sent / Paid filters work
- Mark Paid button sets paidDate
- Download PDF works

- [ ] **Step 5: Verify Reports page**

Open Reports. Verify:
- Mileage summary shows total miles and IRS deduction
- Revenue chart uses paidDate (cash basis)
- Schedule C export includes mileage deduction
- Year filter shows 2026+

- [ ] **Step 6: Verify onboarding**

Clear system_config `onboardingCompleted`. Reload app. Verify:
- Wizard appears with 5 steps
- Can fill and save business profile
- Can create first agency
- "Get Started" dismisses and sets onboardingCompleted

- [ ] **Step 7: Commit all remaining changes**

```bash
git add apps/desktop/ packages/shared/
git commit -m "feat: complete feature parity — inspection workflow, invoicing, settings, reports"
```
