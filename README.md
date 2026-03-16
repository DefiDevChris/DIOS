# DIOS Studio

**Inspection Management Platform for Independent Inspectors**

DIOS Studio is a local-first desktop application built for certified organic inspectors (and any independent field inspector) to manage the business side of their work. It handles the full workflow — agencies, operators (farms, handlers, processors), inspection scheduling, route planning, invoicing, expense tracking, document management, and tax reporting.

Download, install, and start working. No accounts or API keys required. Sign in with Google to unlock Drive, Gmail, Calendar, and Sheets — your data stays in your own Google account.

## Who This Is For

Independent inspectors who contract with multiple **certifying agencies** to inspect **operators** — farms (crop operations), handlers (processing plants), and other certified businesses. The inspector needs to:
- Track which operators belong to which agencies
- Schedule and bundle inspections into efficient trips
- Generate invoices with agency-specific billing rates
- Scan and categorize expense receipts
- Store inspection documents organized by operator
- Plan driving routes across multiple stops
- Manage emails, calendar events, and Google Drive files
- Export billing reports and tax summaries

## Getting Started

### Install

Download the installer for your platform:
- **Windows** — `.exe` (NSIS installer)
- **macOS** — `.dmg` (drag to Applications)
- **Linux** — `.AppImage` (double-click to run)

No Node.js, terminal, or developer tools needed.

### First Launch

1. **Setup Wizard** — Pick a local folder for documents (auto-detected on desktop). Click "Complete Setup." That's it.
2. **Onboarding** — Enter your business name, address, email signature, and first certifying agency.
3. **Start working** — Everything runs locally with SQLite. Fully offline-capable.

### Sign in with Google (optional)

Click "Sign in with Google" to connect your Google account. This enables:
- **Google Sheets** — A master spreadsheet is automatically created and synced with all your inspections, operators, and expenses
- **Google Drive** — File browser with per-operator folder hierarchy
- **Gmail** — Invoice emailing with agency templates
- **Google Calendar** — Inspection scheduling sync

Your data stays in your own Google account. DIOS Studio never stores your data on its servers.

### Optional Features (Settings → Data & Integrations)

| Feature | What it enables | Setup |
|---------|----------------|-------|
| **Cloud Sync (Firebase)** | Real-time backup across devices | Create a free Firebase project (step-by-step guide in Settings) |

When Firebase isn't configured, cloud sync features are hidden — the app works fully offline without it.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron, React 19, TypeScript 5.8, Tailwind CSS 4 |
| Build | Vite 6 |
| Local DB | better-sqlite3 (via Electron IPC) |
| Cloud (optional) | Firebase 12 (Auth, Firestore, Storage) |
| Geocoding | Nominatim / OpenStreetMap (free, no API key) |
| Routing | OSRM — Open Source Routing Machine (free, no API key) |
| Workspace | Google Drive, Gmail, Calendar, Sheets APIs |
| OCR | Tesseract.js 7 (in-browser receipt scanning) |
| PDF | jsPDF 4 (invoices, tax reports) |
| Charts | Recharts 3 |

## Features

### Inspection Management
- **Operators** — Manage farms, handlers, and businesses you inspect. Track contacts, addresses, status, and link to certifying agencies. CSV import supported.
- **6-Step Inspection Workflow** — Scheduled → Prep → Inspected → Report → Invoiced → Paid. Each step has a modal collecting hours and checklist data. Visual progress bar on each operator page.
- **Per-Agency Checklists** — Configurable prep and report checklists per agency. Enable/disable per agency, edit items in Settings.
- **Distance & Nearby** — Each operator shows round-trip mileage and drive time from homebase (OSRM, no API key needed). "Nearby" modal shows operators sorted by distance for trip planning.
- **Scheduling** — Calendar view with trip bundling. Sync to Google Calendar.
- **Routing** — Multi-stop route planner with cumulative mileage and drive time (OSRM). Add stops, reorder, see per-leg and total distances.

### Billing & Finance
- **Invoice Editor** — Full editable invoice after Report step. Pre-populated with calculated hours, drive time, mileage, per diem, expenses, and agency default line items.
- **Invoice Emailing** — Per-agency email templates with `{variable}` substitution. Gmail compose pre-filled with template, PDF attached.
- **Invoice Statuses** — Not Complete / Sent / Paid. Cash-basis revenue tracking (counted in year payment received).
- **Per-Agency Billing** — Flat rate toggle, hourly rates, per-type rate overrides, drive time hourly rate, mileage reimbursement toggle, per diem, default line items.
- **Expenses** — Receipt scanning via OCR (Tesseract.js) with automatic vendor/amount extraction. Manual entry fallback.
- **Tax Reporting** — Mileage deduction (IRS rate × total miles), cash-basis income, expense categories. Schedule C PDF export.
- **Analytics** — KPI dashboards with income/expense breakdowns.

### Google Sheets Auto-Sync
When signed in with Google, a master spreadsheet ("DIOS Studio - {year}") is automatically created in your Google Drive with three tabs:
- **Inspections** — One row per inspection: status, agency, operator, dates, hours, mileage, invoice details, payment status (26 columns)
- **Operators** — All operators: name, agency, type, address, contact info, distance, notes (15 columns)
- **Expenses** — All expenses: date, vendor, amount, category, notes, receipt indicator (7 columns)

The sheet syncs automatically — rows update on every save, and a full sync runs every 5 minutes. Tabs are protected (read-only) to prevent accidental edits; duplicate the sheet to work with the data.

### Business Profile & Settings
- **Onboarding Wizard** — First-run setup: business name, address (geocoded for homebase), email signature, first agency.
- **Tabbed Settings** — My Business tab, one tab per agency, Add Agency, Data & Integrations.
- **Data & Integrations** — Toggle-based configuration for Firebase and OAuth (built-in by default) with expandable step-by-step setup guides.
- **Rich Email Signature** — HTML editor with live preview. Auto-generated from business profile.

### Documents & Communication
- **Google Drive** — File browser with organized folder hierarchy per operator and year.
- **Gmail** — Inbox integration for CRM-linked email management.
- **Google Sheets** — Auto-synced master sheet plus on-demand data exports.
- **Document Upload** — Photos and documents attached to operators, stored locally and backed up to Drive.

### Offline & Sync
- **Local-First** — All data stored in local SQLite. The app works fully offline.
- **Local File Storage** — Documents save to disk (`~/DIOS Studio/[operator]/[year]/`).
- **Cloud Backup** — Background sync mirrors local changes to Firestore and Google Drive when online (requires Firebase setup).
- **Sync Status** — Visual indicator showing synced/pending/offline state.
- **Offline Queue** — Failed API calls (Sheets, Drive, Firestore) are queued in IndexedDB and retried automatically when connectivity returns.

### Mobile Companion
- Lightweight web app for field use (Firebase Hosting)
- Sign in with Google, select an operator, snap a photo or pick a file, upload
- Files go to Firebase Storage/Drive and link to the operator

## Architecture

```
apps/
├── desktop/                       # Electron desktop app
│   ├── main/                      # Electron main process
│   │   ├── database.ts            # SQLite connection + init
│   │   ├── schema.ts              # Table definitions + migrations
│   │   ├── syncEngine.ts          # Background Firestore sync
│   │   └── preload.ts             # IPC bridge for renderer
│   └── renderer/                  # React frontend (Vite)
│       └── src/
│           ├── App.tsx            # Router, auth guard, onboarding check
│           ├── contexts/          # AuthContext, BackgroundSyncContext
│           ├── hooks/             # useDatabase, useFileStorage, useOnlineStatus, useSheetsSync
│           ├── lib/               # sheetsSync, sheetsSyncQueue, driveSync, localFsSync, syncQueue
│           ├── utils/             # addressParser, invoiceCalculator, geocoding, systemConfig
│           ├── components/        # Reusable UI (see below)
│           └── pages/             # Route-level pages
├── mobile/                        # Mobile companion SPA (Vite, Firebase Hosting)

packages/
└── shared/                        # Shared types, config store, Google API client
    └── src/
        ├── types.ts               # Agency, Operation, Inspection, Invoice, etc.
        ├── configStore.ts         # localStorage config with OAuth default
        ├── constants.ts           # OAuth scopes, default Client ID
        └── googleApiClient.ts     # Authenticated fetch wrapper with token refresh
```

### Key Components

| Component | Purpose |
|-----------|---------|
| SetupWizard | Single-screen first-run: folder selection, done |
| OnboardingWizard | Business profile: name, address, signature, first agency |
| InspectionProgressBar | 6-step workflow: Scheduled → Prep → Inspected → Report → Invoiced → Paid |
| StepModal | Checklist + hours modal for Prep/Inspected/Report steps |
| InvoiceEditor | Full editable invoice with pre-calculated line items |
| InvoiceEmailModal | Gmail compose with agency template and PDF attachment |
| BusinessProfileTab | My Business settings |
| AgencySettingsTab | Per-agency rates, checklists, email templates |
| SignatureEditor | Rich HTML email signature with live preview |
| NearbyOperatorsModal | Distance-sorted nearby operators (Haversine) |

## Data Model

All user data lives in local SQLite (and optionally mirrored to Firestore under `/users/{userId}/`):

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `agencies` | Certifying agencies | name, billingAddress, rates, emailTemplate, checklists, defaultLineItems |
| `operations` | Operators you inspect | name, agencyId, address, contact, operationType, clientId, lat/lng, cachedDistance |
| `inspections` | Inspection workflow records | operationId, date, status, prepHours, onsiteHours, reportHours, calculatedMileage, checklistData |
| `invoices` | Generated invoices | inspectionId, agencyId, totalAmount, lineItems, status (Not Complete/Sent/Paid), paidDate |
| `expenses` | Business expenses | date, vendor, amount, category, receiptImageUrl, inspectionId |
| `tasks` | Notes & follow-ups | title, status, dueDate, operationId |
| `notes` | Quick notes | content, operationId |
| `system_settings` | Business profile & settings | businessName, address, irsMileageRate, emailSignatureHtml, homebaseLat/Lng, sheetsSpreadsheetId |

## Development

### Prerequisites
- Node.js 18+

### Setup
```bash
git clone <repo-url>
cd DIOS
npm install
npm run dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start desktop dev server (port 3000) |
| `npm run dev:mobile` | Start mobile dev server (port 3001) |
| `npm run build` | Build shared + desktop (Vite) |
| `npm run build:electron` | Build desktop + package Electron binary |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type checking (tsc --noEmit) |
| `npm run test` | Run Vitest test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run clean` | Remove dist, dist-electron, out |

### Building Installers

```bash
cd apps/desktop
npm run build:electron
```

Output in `apps/desktop/out/`:
- Windows: `.exe` (NSIS)
- macOS: `.dmg`
- Linux: `.AppImage`

Auto-update is configured via `electron-updater` with GitHub Releases.

### macOS App Icon
`apps/desktop/scripts/generate-icons.sh` generates platform icons. For macOS `.icns`, run on a Mac with Xcode Command Line Tools.

## Production Notes

### Google OAuth
The app ships with a built-in OAuth Client ID for Google Workspace access. Users can override this in Settings → Data & Integrations. For production use beyond 100 users, the Google Cloud project must go through [OAuth verification](https://support.google.com/cloud/answer/9110914).

### Demo Mode
Enter `dummy` as the API key in the Setup Wizard to bypass auth and run with a local demo user.

## License

Private — All rights reserved.
