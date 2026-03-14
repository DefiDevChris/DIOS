# DIOS Studio

**Inspection Management Platform for Independent Inspectors**

DIOS Studio is a local-first, cloud-backed desktop application built for certified organic inspectors (and any independent field inspector) to manage the business side of their work. It handles the full workflow — agencies, operators (farms, handlers, processors), inspection scheduling, route planning, invoicing, expense tracking, document management, and tax reporting.

The system has two components:
1. **Desktop App** (Electron) — The primary tool. Runs offline, syncs to the cloud when connected.
2. **Mobile Companion** (Web) — A lightweight upload tool for field use. Snap photos and upload documents from your phone.

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron, React 19, TypeScript 5.8, Tailwind CSS 4 |
| Build | Vite 6 |
| Local DB | better-sqlite3 (via Electron IPC) |
| Cloud | Firebase 12 (Auth, Firestore, Storage) |
| Maps | Google Maps JavaScript API, Directions API, Geocoding API |
| Workspace | Google Drive, Gmail, Calendar, Sheets APIs |
| OCR | Tesseract.js 7 (in-browser receipt scanning) |
| PDF | jsPDF 4 (invoices, tax reports) |
| Charts | Recharts 3 |
| Calendar | React Big Calendar |

## Features

### Inspection Management
- **Operators** — Manage farms, handlers, and businesses you inspect. Track contacts, addresses, status, and link to certifying agencies. CSV import supported.
- **Inspections** — Schedule, bundle, and track field inspections. Log hours, mileage, and per diem. Bundle multi-stop trips to share drive time across invoices.
- **Scheduling** — Calendar view with trip bundling. Sync to Google Calendar.
- **Routing** — Google Maps-powered multi-stop route optimization with mileage calculation. Manual drag-and-drop reordering when offline.

### Billing & Finance
- **Invoicing** — PDF invoices with per-agency billing rates: flat rate base, additional hourly, mileage, travel time, per diem, and custom line items.
- **Expenses** — Receipt scanning via OCR (Tesseract.js) with automatic vendor/amount extraction. Manual entry fallback.
- **Billing Reports** — Custom date-range reports by agency with PDF export.
- **Tax Reporting** — Income vs. expense summaries with PDF export for tax preparation.
- **Analytics** — KPI dashboards with income/expense breakdowns.

### Documents & Communication
- **Google Drive** — File browser with organized folder hierarchy per operator and year.
- **Gmail** — Inbox integration for CRM-linked email management.
- **Google Sheets** — Data export and spreadsheet integration.
- **Document Upload** — Photos and documents attached to operators, stored locally and backed up to Drive.

### Offline & Sync
- **Local-First** — All data stored in local SQLite. The app works fully offline.
- **Local File Storage** — Documents save to disk (`~/DIOS Studio/[operator]/[year]/`).
- **Cloud Backup** — Background sync mirrors local changes to Firestore and Google Drive when online.
- **Sync Status** — Visual indicator showing synced/pending/offline state.

### Mobile Companion
- Lightweight web app for field use (Firebase Hosting)
- Sign in with Google, select an operator, snap a photo or pick a file, upload
- Files go to Firebase Storage/Drive and link to the operator

## Architecture

```
apps/
├── desktop/                   # Electron wrapper
│   ├── main/                  # Electron main process (IPC, SQLite, sync engine)
│   └── renderer/              # React app (Vite)
├── mobile/                    # Mobile companion SPA (Vite, Firebase Hosting)

packages/
└── shared/                    # Shared types, Firebase config, auth logic

src/                           # Current source (migrating into apps/desktop/renderer)
├── main.tsx                   # App entry point
├── App.tsx                    # Router, auth guard
├── firebase.ts                # Firebase initialization
├── contexts/
│   ├── AuthContext.tsx         # Google OAuth + token management
│   └── BackgroundSyncContext.tsx
├── lib/
│   ├── configStore.ts         # Config persistence
│   ├── syncQueue.ts           # Upload queue (being replaced by Electron sync)
│   ├── driveSync.ts           # Google Drive folder hierarchy
│   ├── localFsSync.ts         # Local file system wrapper
│   └── pdfGenerator.ts        # Invoice & tax report PDF generation
├── utils/
│   ├── googleApiClient.ts     # Google API fetch wrapper with 401 retry
│   ├── geocodingUtils.ts      # Address → lat/lng
│   └── firestoreErrorHandler.ts
├── components/
│   ├── Layout.tsx             # Sidebar + command palette
│   ├── SetupWizard.tsx        # Firebase & API key configuration
│   ├── ReceiptScanner.tsx     # Camera + OCR + manual entry
│   ├── ProcessUploadModal.tsx # File processor
│   ├── TasksWidget.tsx        # Task list with entity tagging
│   └── LeafLogo.tsx
├── pages/
│   ├── Dashboard.tsx          # Upcoming inspections, tasks, uploads
│   ├── Operations.tsx         # Operator directory
│   ├── OperationProfile.tsx   # Operator detail: docs, activities, email
│   ├── Inspections.tsx        # Inspection list
│   ├── InspectionProfile.tsx  # Inspection detail: billing, expenses
│   ├── Invoices.tsx           # Invoice list + PDF download
│   ├── Expenses.tsx           # Expense tracking
│   ├── Schedule.tsx           # Calendar + trip bundling
│   ├── NotesTasks.tsx         # Tasks & notes
│   ├── Routing.tsx            # Map-based routing
│   ├── Email.tsx              # Gmail integration
│   ├── Reports.tsx            # Billing reports
│   ├── Insights.tsx           # Analytics dashboards
│   ├── Drive.tsx              # Google Drive browser
│   ├── Sheets.tsx             # Google Sheets
│   ├── MobileHub.tsx          # Mobile capture
│   └── Settings.tsx           # Agencies, integrations, backup
└── types/
```

## Data Model

All user data lives under `/users/{userId}/` in Firestore (and mirrored in local SQLite):

| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `agencies` | Certifying agencies that hire you | name, billing address, rates (flat, hourly, mileage, travel time, per diem) |
| `operations` | Operators you inspect | name, agency, address, contact, status, inspection status |
| `operations/{id}/documents` | Files attached to an operator | name, url, size, type |
| `operations/{id}/activities` | Activity log per operator | type, description, timestamp |
| `inspections` | Scheduled/completed inspections | operator, date, hours, miles, bundle info, billing details |
| `invoices` | Generated invoices | inspection, agency, amount, PDF Drive ID, paid/unpaid |
| `tasks` | Notes & follow-ups | title, status, due date, linked operator/inspection |
| `expenses` | Business expenses | date, vendor, amount, receipt image |
| `system_settings/config` | Drive folder IDs, defaults | root, uploads, receipts, reports folders |

## Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project (Auth, Firestore, Storage enabled)
- A Google Cloud project with APIs enabled: Maps, Geocoding, Directions, Drive, Gmail, Calendar, Sheets
- An OAuth 2.0 Client ID

### Setup

```bash
npm install
npm run dev
```

On first launch, the Setup Wizard prompts for Firebase config, Google Maps API key, and OAuth Client ID. Config is stored in `localStorage`.

### Demo Mode

Enter `dummy` as the API key in the Setup Wizard to bypass auth and run with a local demo user.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type checking |

## License

Private — All rights reserved.
