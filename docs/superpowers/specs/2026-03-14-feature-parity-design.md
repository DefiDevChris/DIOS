# DIOS Studio — Feature Parity Design Spec

**Date:** 2026-03-14
**Status:** Draft
**Scope:** 6 features bringing DIOS to parity with the legacy A11 app

---

## 1. Overview

This spec covers 6 features missing from DIOS Studio compared to the legacy DOIS Studio (A11) app:

1. Inspection workflow with checklists and hour tracking
2. Invoice editor with pre-populated line items
3. Invoice emailing with per-agency templates
4. Business profile, onboarding, and email signature
5. Operation distance calculation and nearby operators
6. Operation-filtered email history

### Out of Scope

- Intel / knowledge graph features
- Quick links
- Places autocomplete for address entry
- USDA NASS integration
- Automated backups (current 60s Firestore sync + trigger-based Drive sync is sufficient)
- Quarterly financial views
- Mobile app changes

---

## 2. Data Model Changes

### 2.1 `operations` table — new fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `operationType` | string | `''` | Operation type: "crop", "handler", or custom |
| `clientId` | string | `''` | User-defined client/operator ID (e.g., "VFO-001") |
| `cachedDistanceMiles` | number | null | Cached round-trip distance from homebase (miles) |
| `cachedDriveTimeMinutes` | number | null | Cached round-trip drive time from homebase (minutes) |

### 2.1b `notes` table — new fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `operationId` | string | null | Links note to a specific operation (for Sticky Note Widget) |

### 2.2 `inspections` table — new fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `prepHours` | number | 0 | Hours spent on prep work |
| `onsiteHours` | number | 0 | Hours spent onsite inspecting |
| `reportHours` | number | 0 | Hours spent writing report |
| `prepChecklistData` | string (JSON) | `'[]'` | Array of `{item: string, checked: boolean}` |
| `reportChecklistData` | string (JSON) | `'[]'` | Array of `{item: string, checked: boolean}` |
| `calculatedMileage` | number | 0 | Exact round-trip miles from Directions API |
| `calculatedDriveTime` | number | 0 | Exact round-trip minutes from Directions API |

**`status` field updated:** Values change from `'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'` to `'Scheduled' | 'Prep' | 'Inspected' | 'Report' | 'Invoiced' | 'Paid' | 'Cancelled'`. Migration: `'In Progress'` → `'Scheduled'`, `'Completed'` → `'Paid'`.

The `Operation.inspectionStatus` field (existing, lowercase values: `'prep' | 'scheduled' | 'inspected' | 'report' | 'invoiced' | 'paid'`) is **removed**. The inspection's own `status` field is the single source of truth. The progress bar reads from the inspection record directly.

Existing fields retained: `baseHoursLog`, `additionalHoursLog`, `milesDriven`, `isBundled`, `totalTripDriveTime`, `totalTripStops`, `sharedDriveTime`, `mealsAndExpenses`, `perDiemDays`, `customLineItemName`, `customLineItemAmount`, `invoiceNotes`, `invoiceExceptions`, `reportCompleted`, `googleCalendarEventId`.

### 2.3 `agencies` table — new/changed fields

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `billingEmail` | string | `''` | Default email address for invoices |
| `billingContactName` | string | `''` | Agency contact name for emails |
| `emailTemplateSubject` | string | `'{operatorName} Invoice'` | Email subject template |
| `emailTemplateBody` | string | *(see default below)* | Email body template |
| `prepChecklistEnabled` | boolean | true | Whether prep checklist is shown |
| `prepChecklistItems` | string (JSON) | `'["Prep complete"]'` | Default prep checklist items |
| `reportChecklistEnabled` | boolean | true | Whether report checklist is shown |
| `reportChecklistItems` | string (JSON) | `'["Report complete"]'` | Default report checklist items |
| `isFlatRate` | boolean | false | Flat rate vs hourly billing toggle |
| `flatRateAmount` | number | 0 | Flat rate dollar amount |
| `flatRateIncludedHours` | number | 0 | Hours included in flat rate |
| `flatRateOverageRate` | number | 0 | $/hr for hours over included |
| `hourlyRate` | number | 0 | Hourly rate when not flat rate |
| `driveTimeHourlyRate` | number | 0 | $/hr for drive time |
| `mileageReimbursed` | boolean | false | Whether agency pays mileage |
| `mileageRate` | number | 0 | $/mile when mileage is reimbursed (retained from existing schema) |
| `perDiemRate` | number | 0 | $/day for per diem (retained from existing schema) |
| `perTypeRatesEnabled` | boolean | false | Different rates per operation type |
| `ratesByType` | string (JSON) | `'{}'` | Per-type rate overrides (see below) |
| `operationTypes` | string (JSON) | `'["crop","handler"]'` | Available operation types for this agency |
| `defaultLineItems` | string (JSON) | `'[]'` | Array of `{name: string, amount: number}` — appear on every invoice |

**Existing rate fields replaced:** `flatRateBaseAmount`, `flatRateIncludedHours`, `additionalHourlyRate`, `mileageRate`, `travelTimeHourlyRate`, `perDiemRate`, `driveBillingMethod` are replaced by the new rate structure above. Migration maps old values to new fields.

**Default email template body:**
```
Hey {agencyContact},

Here is the invoice for the completed inspection for {operatorName}.

Please let me know if you have any questions.

{signature}
```

**`ratesByType` JSON structure** (when `perTypeRatesEnabled` is true):
```json
{
  "crop": {
    "isFlatRate": true,
    "flatRateAmount": 360,
    "flatRateIncludedHours": 3,
    "flatRateOverageRate": 72,
    "driveTimeHourlyRate": 60,
    "mileageReimbursed": false,
    "mileageRate": 0,
    "perDiemRate": 50
  },
  "handler": {
    "isFlatRate": true,
    "flatRateAmount": 515,
    "flatRateIncludedHours": 4,
    "flatRateOverageRate": 72,
    "driveTimeHourlyRate": 60,
    "mileageReimbursed": false,
    "mileageRate": 0,
    "perDiemRate": 50
  }
}
```

When `perTypeRatesEnabled` is false, the top-level rate fields apply to all operation types. When true, the invoice calculation looks up the operation's `operationType` in `ratesByType`, falling back to top-level rates for any type not configured.

### 2.4 `invoices` table — changed fields

| Field | Change | Purpose |
|-------|--------|---------|
| `status` | Values: `'Not Complete'`, `'Sent'`, `'Paid'` | Replaces `'Unpaid'`/`'Paid'` |
| `paidDate` | New, string (ISO) | Date payment received — used for cash-basis year assignment |
| `sentDate` | New, string (ISO) | Date invoice was emailed |

### 2.5 `system_config` — new entries

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `businessName` | string | `''` | Business name for invoices |
| `ownerName` | string | `''` | Inspector's full name |
| `ownerTitle` | string | `''` | Title (e.g., "Organic Inspector") |
| `businessAddress` | string | `''` | Street address |
| `businessCity` | string | `''` | City |
| `businessState` | string | `''` | State |
| `businessZip` | string | `''` | ZIP code |
| `businessPhone` | string | `''` | Phone number |
| `businessEmail` | string | `''` | Email address |
| `homebaseLat` | number | 0 | Geocoded latitude of business address |
| `homebaseLng` | number | 0 | Geocoded longitude of business address |
| `emailSignatureHtml` | string | `''` | Rich HTML email signature |
| `onboardingCompleted` | boolean | false | Whether onboarding wizard has been completed |
| `irsMileageRate` | number | 0.70 | IRS standard mileage rate for deductions (2026 default) |

### 2.6 No New Tables

All changes extend existing tables. No new collections or tables are introduced.

---

## 3. Settings Restructure

### 3.1 Layout

Tabbed interface replacing the current single-page layout.

**Tabs:**
- **My Business** — always first
- **[Agency Name]** — one tab per agency, dynamically generated
- **+ Add Agency** — creates a new agency
- **Data & Integrations** — local folder sync, email whitelist, backup/reset

### 3.2 My Business Tab

**Fields:**
- Business name
- Owner name, title
- Address, city, state, zip (geocoded to set `homebaseLat`/`homebaseLng`)
- Phone, email
- Rich HTML email signature editor with live preview
  - Default auto-generated from business fields on first save
  - Full rich text editing (bold, italic, links, images)

### 3.3 Agency Tab (one per agency)

**Sections within each agency tab:**

**Billing Rates**
- Flat rate toggle (yes/no)
  - If yes: flat rate amount ($), included hours, overage hourly rate ($/hr)
  - If no: hourly rate ($/hr)
- Drive time hourly rate ($/hr) — always shown
- Mileage reimbursed toggle (yes/no)
  - If yes: mileage rate ($/mi)
- Per diem rate ($/day)
- Default line items: list of `{name, amount}` with + Add button

**Per-Type Rates Toggle**
- When enabled: shows separate rate config sections for each operation type (crop, handler, custom)
- Each type section has the same fields as the base rate config
- "+ Add Type" to create custom operation types

**Billing Contact**
- Contact name
- Billing email address

**Email Template**
- Subject field with `{variable}` support
- Body field (textarea) with `{variable}` support
- Available variables listed: `{agencyContact}`, `{agencyName}`, `{operatorName}`, `{inspectionDate}`, `{invoiceNumber}`, `{totalAmount}`, `{signature}`

**Prep Checklist**
- Enable/disable toggle
- Editable list of checklist items (add, remove, reorder)
- Default: enabled with one item "Prep complete"

**Report Checklist**
- Enable/disable toggle
- Editable list of checklist items (add, remove, reorder)
- Default: enabled with one item "Report complete"

**Drive Folder**
- Google Drive folder link (existing)

**Danger Zone**
- Delete agency button with confirmation

### 3.4 Data & Integrations Tab

Existing functionality moved here:
- Local folder sync configuration
- Whitelisted email management
- JSON backup download
- Reset integration keys

---

## 4. Operation Profile Redesign

### 4.1 Layout (matching legacy app mockups)

**Header Area:**
- Back arrow (top-left)
- Operation name with edit pencil icon
- Client ID (from `operation.clientId`, user-defined), agency badge (color-coded), operation type badge (CROP, HANDLER, etc.)
- Contact info: name, address, phone, email (with send icon)
- Description/notes text

**Top-Right:**
- `+ Schedule` button (primary, brown) — triggers Scheduled step
- `Maps` button — opens Google Maps for operation address
- `Nearby` button — opens nearby operators modal
- Distance display: "62.4 mi · 1.5 hrs" (from homebase, auto-calculated)
- Year selector tabs: `2026` and forward only (no historical years before 2026)

**6-Step Progress Bar** (centered, below header):
```
Scheduled → Prep → Inspected → Report → Invoiced → Paid
```
- Icon + label for each step
- Connected by `>` arrow separators
- States: empty (not started), outlined (current/active), filled with checkmark (complete)
- Current step highlighted with colored border
- Clickable when previous step is complete — opens step modal
- Year-aware: shows progress for the selected year's inspection cycle
- Resets when a new year is selected and no inspection exists for that year

**Tab Bar:**
- Overview | Inspections | Documents | Activity

### 4.2 Overview Tab

**Sticky Note Widget** (top of tab):
- Text input for quick note/task
- Toggle: Note vs Task
- If Task: optional due date
- Saves to notes or tasks table linked to this operation

**Unified Activity Feed** (below sticky note):
- Chronological list (newest first) combining:
  - Notes (user-created, with content)
  - Tasks (with status badge: pending/completed)
  - Emails (threads to/from operator's email — subject line + snippet)
  - Activity log entries (status changes, document uploads, inspection events)
- Each entry shows: icon by type, timestamp, content/description
- Emails are clickable → opens thread in Email page or modal

### 4.3 Inspections Tab

- List of inspections for this operation (year-filtered)
- One inspection per year (annual organic inspection cycle)
- Click through to inspection detail

### 4.4 Documents Tab

- Existing file upload + document list (unchanged)

### 4.5 Activity Tab

- Full activity log (existing, unchanged)

### 4.6 Distance Calculation

On page load (or when operation address changes):
1. Read `homebaseLat`/`homebaseLng` from system_config
2. Read operation's `lat`/`lng` (or geocode from address)
3. Call Google Maps Directions API for round-trip distance and duration
4. Display in top-right: "X mi · Y hrs" (exact values)
5. Cache result on the operation record (`cachedDistanceMiles`, `cachedDriveTimeMinutes`) to avoid repeated API calls. Recalculate only when operation address or homebase address changes.

### 4.7 Nearby Operators Modal

Triggered by "Nearby" button:
- List of all other operations sorted by distance from this operation
- Shows: name, agency badge, distance (miles), drive time
- Useful for bundling trips
- Click an operator → navigates to their profile

---

## 5. Inspection Workflow Step Modals

### 5.1 Step 1: Scheduled

- Triggered by `+ Schedule` button in header
- Date picker for inspection date
- Creates inspection record with `status: 'Scheduled'`
- Syncs to Google Calendar
- Progress bar advances to Scheduled (filled)

### 5.2 Step 2: Prep (modal)

- Agency's prep checklist items as checkboxes (if `prepChecklistEnabled`)
- "Prep Hours" number input below checklist
- "Complete Prep" button
  - If checklist enabled: disabled until all items checked
  - If checklist disabled: just needs hours entered
- Saves: `prepHours`, `prepChecklistData` to inspection
- Progress bar advances to Prep (filled)

### 5.3 Step 3: Inspected (modal)

- "Onsite Hours" number input
- "Complete Inspection" button
- Saves: `onsiteHours` to inspection
- Progress bar advances to Inspected (filled)

### 5.4 Step 4: Report (modal)

- Agency's report checklist items as checkboxes (if `reportChecklistEnabled`)
- "Report Writing Hours" number input below checklist
- "Complete Report" button
  - If checklist enabled: disabled until all items checked
  - If checklist disabled: just needs hours entered
- Saves: `reportHours`, `reportChecklistData` to inspection
- Progress bar advances to Report (filled)
- "View Invoice" button now appears

### 5.5 Step 5: Invoiced

See Section 6 (Invoice Editor).

### 5.6 Step 6: Paid

- Click marks invoice status as `'Paid'`
- Records `paidDate` (current date)
- Progress bar fully complete

---

## 6. Invoice Editor

### 6.1 Trigger

After Report step completes, a "View Invoice" button appears on the progress bar area. Clicking it opens the invoice editor as a full page or large modal.

### 6.2 Pre-Populated Line Items

The editor calculates and pre-fills from inspection data + agency rate config:

| Line Item | Calculation |
|-----------|-------------|
| Inspection fee | If flat rate: `flatRateAmount`. If hourly: `(prepHours + onsiteHours + reportHours) * hourlyRate` |
| Additional hours | If flat rate and total hours > included: `(totalHours - flatRateIncludedHours) * flatRateOverageRate` |
| Drive time | Round-trip drive time rounded to nearest half hour × `driveTimeHourlyRate`. If bundled: divided by number of stops. |
| Mileage | Only if `mileageReimbursed`: round-trip miles × `mileageRate`. If bundled: total trip miles / stops + inter-stop miles. |
| Per diem | `perDiemDays * perDiemRate` |
| Meals & expenses | `mealsAndExpenses` (from inspection record) |
| Agency default line items | Each `{name, amount}` from agency's `defaultLineItems` |
| Linked expenses | Any expenses linked to this inspection |

**Total hours calculation:** `prepHours + onsiteHours + reportHours`

### 6.3 Editable Fields

- All line item amounts are editable
- All line item names are editable
- Line items can be removed
- "+ Add Line Item" button to add custom entries
- Notes textarea at bottom (saved as `invoiceNotes`)

### 6.4 Actions

**Print / Download:**
- Generates PDF via jsPDF (existing `pdfGenerator.ts` extended)
- Professional format: header with business info, bill-to (agency), service-for (operation), itemized line items, total, notes
- Downloads locally + queues for Drive upload

**Email:**
- Opens Gmail compose modal
- Pre-filled from agency email template:
  - To: agency `billingEmail`
  - Subject: rendered `emailTemplateSubject` with variables replaced
  - Body: rendered `emailTemplateBody` with variables replaced
  - Attachment: invoice PDF (auto-generated)
- User reviews and sends
- On send: invoice status → `'Sent'`, `sentDate` recorded
- Activity logged on the operation

### 6.5 Mileage — Always Tracked for Tax

Regardless of whether the agency reimburses mileage:
- `calculatedMileage` is always saved on the inspection
- Always flows to tax/financial reports
- Only appears as an invoice line item when `mileageReimbursed` is true for the agency

---

## 7. Invoices Page Changes

### 7.1 Status Filters

Replace current Paid/Unpaid tabs with:
- **All** — all inspections and invoices
- **Not Complete** — shows inspections that have not yet reached the Invoiced step (query against inspections table where status is not 'Invoiced' or 'Paid'). These are not invoice records — they are inspection records shown for visibility.
- **Sent** — invoice records with status `'Sent'`, awaiting payment
- **Paid** — invoice records with status `'Paid'`, payment received

### 7.2 Table Columns

- Date (invoice date)
- Operation name
- Agency (color badge)
- Amount
- Status (badge: Not Complete / Sent / Paid)
- Actions (View, Download PDF, Mark Paid)

### 7.3 Year Filter

All invoices filtered by the global year selector. Revenue counted by the year **payment was received** (`paidDate`), not invoice date.

---

## 8. Tax & Financial Reports

### 8.1 Mileage Summary Section (new)

Added to Reports page:
- Total miles driven (sum of all `calculatedMileage` for the selected year)
- IRS standard mileage rate (from `system_config.irsMileageRate`)
- Total mileage deduction: `totalMiles * irsMileageRate`
- Monthly breakdown table

### 8.2 Revenue — Cash Basis

All revenue charts and calculations use `paidDate` year, not invoice date:
- An invoice sent in December 2025 but paid in January 2026 counts as 2026 revenue
- Monthly revenue chart uses payment month

### 8.3 Schedule C PDF Export (updated)

Existing export enhanced with:
- Mileage deduction section:
  - Total miles driven
  - IRS mileage rate used
  - Total mileage deduction amount
- Revenue based on payment received date
- One inspection per operator per year assumption

### 8.4 Year Filter

Yearly view only (no quarterly). Year selector controls all data on the page.

---

## 9. Operation Email Filtering

### 9.1 Gmail CRM Panel on Operation Profile

The existing Gmail CRM panel on the Operation Profile is scoped to only show email threads where the **operator's email address** appears in the `to` or `from` fields.

**Implementation:**
- Gmail API query: `from:{operatorEmail} OR to:{operatorEmail}`
- No other emails shown (no agency emails, no whitelisted emails mixed in)
- Compose button pre-fills the To field with the operator's email

### 9.2 Unified Activity Feed Integration

Email threads matching the operator also appear in the Overview tab's unified activity feed, interspersed chronologically with notes, tasks, and activity entries.

---

## 10. Onboarding Modal

### 10.1 Trigger

Shown on first app launch when `onboardingCompleted` is false in `system_config`.

### 10.2 Steps

**Step 1: Welcome**
- "Welcome to DIOS Studio"
- Business name input
- Your name input
- Title input

**Step 2: Address**
- Street address
- City, state, zip
- Phone, email
- This becomes the homebase for distance calculations (geocoded on save)

**Step 3: Email Signature**
- Auto-generated HTML signature from Step 1 & 2 info
- Rich HTML editor to customize
- Live preview

**Step 4: First Agency**
- Agency name
- Billing contact name, billing email
- Rate configuration (flat rate toggle, rates, drive time, mileage, per diem)
- Checklist defaults (can customize or leave defaults)

**Step 5: Done**
- Summary of what was configured
- "Get Started" button → redirects to Dashboard
- Sets `onboardingCompleted: true`

Steps are skippable (can complete later in Settings), but Step 1 & 2 are strongly encouraged with a "Skip" link rather than a prominent button. If all steps are skipped, `onboardingCompleted` is still set to `true` — the wizard does not reappear. The user can configure everything later in Settings.

---

## 11. Yearly Inspection Cycle

### 11.1 One Inspection Per Operator Per Year

- Each operator gets one annual organic inspection
- The 6-step progress bar reflects the current year's cycle
- Year selector on Operation Profile controls which year is displayed

### 11.2 Year Rollover

- When viewing a new year with no inspection, the progress bar shows empty (ready to schedule)
- An inspection from the previous year that spans into the new year (e.g., inspected in December, paid in January) continues showing in the previous year's view until fully complete
- Once the previous year's cycle reaches Paid, the new year is ready for a fresh cycle

### 11.3 Financial Year Assignment

- Revenue: counted in the year **payment is received** (cash basis)
- Mileage: counted in the year the **inspection occurred**
- Expenses: counted in the year the **expense occurred**

---

## 12. Component Architecture

### 12.1 New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `InspectionProgressBar` | `components/` | 6-step progress bar with icons, click handlers |
| `StepModal` | `components/` | Reusable modal for Prep/Inspected/Report steps (checklist + hours) |
| `InvoiceEditor` | `pages/` or `components/` | Full invoice editing view with line items |
| `InvoiceEmailModal` | `components/` | Gmail compose with template pre-fill |
| `NearbyOperatorsModal` | `components/` | Distance-sorted operator list |
| `StickyNote` | `components/` | Quick note/task creation widget |
| `UnifiedActivityFeed` | `components/` | Combined notes/tasks/emails/activity feed |
| `OnboardingWizard` | `components/` | Multi-step first-run setup |
| `SignatureEditor` | `components/` | Rich HTML email signature editor with preview |
| `ChecklistEditor` | `components/` | Reusable checklist item management (add/remove/reorder) |
| `RateConfigSection` | `components/` | Reusable rate configuration form section |
| `AgencySettingsTab` | `components/` | Full agency settings panel |
| `BusinessProfileTab` | `components/` | My Business settings panel |

### 12.2 Modified Pages

| Page | Changes |
|------|---------|
| `OperationProfile.tsx` | New header layout, progress bar, distance display, nearby button, year selector, sticky note, unified feed, email filtering |
| `Settings.tsx` | Complete restructure to tabbed layout with My Business + per-agency tabs |
| `Invoices.tsx` | New status filters (Not Complete/Sent/Paid), updated table |
| `Reports.tsx` | Mileage summary section, cash-basis revenue, updated Schedule C export |
| `InspectionProfile.tsx` | Updated to work with new hour fields (prepHours, onsiteHours, reportHours) |

### 12.3 Modified Libraries

| File | Changes |
|------|---------|
| `pdfGenerator.ts` | Updated invoice PDF with new line item structure, mileage deduction in tax PDF |
| `driveSync.ts` | No changes needed |
| `geocodingUtils.ts` | Add distance/duration calculation between two points |

### 12.4 Schema Migration

| File | Changes |
|------|---------|
| `schema.ts` | New columns on agencies, inspections, operations tables. New system_config entries. |
| `types.ts` | Updated interfaces for Agency, Inspection, Invoice, Operation. New interfaces for rate configs and checklist data. |

---

## 13. Email Template Variables

| Variable | Resolves To |
|----------|-------------|
| `{agencyContact}` | Agency billing contact name |
| `{agencyName}` | Agency name |
| `{operatorName}` | Operation name |
| `{inspectionDate}` | Inspection date (formatted) |
| `{invoiceNumber}` | Generated invoice number |
| `{totalAmount}` | Invoice total (formatted as currency) |
| `{signature}` | User's rich HTML email signature |

---

## 14. Rate Calculation Logic

### 14.1 Rate Resolution

```
1. Get operation's agencyId and operationType
2. Load agency record
3. If agency.perTypeRatesEnabled AND ratesByType[operationType] exists:
     Use ratesByType[operationType] rates
   Else:
     Use agency top-level rates
4. Apply rates to invoice line items
```

### 14.2 Invoice Line Item Calculation

```
totalHours = prepHours + onsiteHours + reportHours

If isFlatRate:
  baseCharge = flatRateAmount
  If totalHours > flatRateIncludedHours:
    overageCharge = (totalHours - flatRateIncludedHours) * flatRateOverageRate
  Else:
    overageCharge = 0
Else:
  baseCharge = totalHours * hourlyRate
  overageCharge = 0

driveTimeHours = round_to_nearest_half_hour(calculatedDriveTime / 60)
If isBundled:
  driveTimeHours = driveTimeHours / totalTripStops
driveTimeCharge = driveTimeHours * driveTimeHourlyRate

If mileageReimbursed:
  mileageCharge = calculatedMileage * mileageRate
  If isBundled:
    mileageCharge = (totalTripMileage / totalTripStops) * mileageRate
Else:
  mileageCharge = 0  (but mileage still tracked for tax)

perDiemCharge = perDiemDays * perDiemRate

total = baseCharge + overageCharge + driveTimeCharge + mileageCharge
        + perDiemCharge + mealsAndExpenses + sum(defaultLineItems)
        + sum(linkedExpenses) + customLineItemAmount
```

### 14.3 Mileage for Tax (always)

```
taxMileageDeduction = calculatedMileage * irsMileageRate
```

This is calculated regardless of `mileageReimbursed` and appears on:
- Reports page mileage summary
- Schedule C PDF export

---

## 15. Migration Strategy

### 15.1 Database Migration

- Add new columns with defaults to existing SQLite tables (non-breaking)
- Existing `flatRateBaseAmount` → `flatRateAmount`
- Existing `additionalHourlyRate` → `flatRateOverageRate`
- Existing `travelTimeHourlyRate` → `driveTimeHourlyRate`
- Existing `mileageRate` retained, add `mileageReimbursed: true` if rate > 0
- Existing invoice status `'Unpaid'` → `'Sent'`, `'Paid'` → `'Paid'`
- Existing `'Paid'` invoices without a `paidDate`: default `paidDate` to the invoice `date` field
- Existing `Operation.inspectionStatus` field removed; inspection `status` is the single source of truth
- Reports page queries updated from `date` to `paidDate` for revenue calculations
- `InvoiceData` interface in `pdfGenerator.ts` and `types.ts` consolidated into a single definition matching the new line item structure
- Firestore documents get new fields on next sync

### 15.2 No Breaking Changes

All new fields have sensible defaults. Existing data continues to work. New UI features are additive — existing pages gain new sections but don't lose existing functionality.
