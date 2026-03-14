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
- **6-Step Inspection Workflow** — Scheduled → Prep → Inspected → Report → Invoiced → Paid. Each step has a modal collecting hours and checklist data. Visual progress bar on each operator page.
- **Per-Agency Checklists** — Configurable prep and report checklists per agency. Enable/disable per agency, edit items in Settings.
- **Distance & Nearby** — Each operator shows exact round-trip mileage and drive time from homebase (Google Directions API). "Nearby" modal shows operators sorted by distance for trip planning.
- **Scheduling** — Calendar view with trip bundling. Sync to Google Calendar.
- **Routing** — Google Maps-powered multi-stop route optimization with mileage calculation. Manual drag-and-drop reordering when offline.

### Billing & Finance
- **Invoice Editor** — Full editable invoice after Report step. Pre-populated with calculated hours, drive time, mileage, per diem, expenses, and agency default line items. Add/remove/edit line items inline.
- **Invoice Emailing** — Per-agency email templates with `{variable}` substitution. Gmail compose pre-filled with template, PDF attached. Status → "Sent" on send.
- **Invoice Statuses** — Not Complete (inspection in progress) / Sent / Paid. Cash-basis revenue tracking (counted in year payment received).
- **Per-Agency Billing** — Flat rate toggle, hourly rates, per-type rate overrides, drive time hourly rate, mileage reimbursement toggle, per diem, default line items.
- **Expenses** — Receipt scanning via OCR (Tesseract.js) with automatic vendor/amount extraction. Manual entry fallback.
- **Tax Reporting** — Mileage deduction (IRS rate × total miles), cash-basis income, expense categories. Schedule C PDF export. Year selector shows 2026+.
- **Analytics** — KPI dashboards with income/expense breakdowns.

### Business Profile & Settings
- **Onboarding Wizard** — First-run setup: business name, address (geocoded for homebase), email signature, first agency.
- **Tabbed Settings** — My Business tab, one tab per agency, Add Agency, Data & Integrations.
- **Rich Email Signature** — HTML editor with live preview. Auto-generated from business profile.

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
├── desktop/                       # Electron desktop app
│   ├── main/                      # Electron main process
│   │   ├── database.ts            # SQLite connection + init
│   │   ├── schema.ts              # Table definitions + migrations
│   │   ├── syncEngine.ts          # Background Firestore sync
│   │   └── ipcHandlers.ts         # IPC bridge for renderer
│   └── renderer/                  # React frontend (Vite)
│       └── src/
│           ├── App.tsx            # Router, auth guard, onboarding check
│           ├── contexts/          # AuthContext, BackgroundSyncContext
│           ├── hooks/             # useDatabase, useFileStorage, useOnlineStatus
│           ├── lib/               # pdfGenerator, driveSync, localFsSync, syncQueue
│           ├── utils/             # invoiceCalculator, distanceUtils, templateRenderer, geocoding
│           ├── components/        # Reusable UI (see below)
│           └── pages/             # Route-level pages (17 pages)
├── mobile/                        # Mobile companion SPA (Vite, Firebase Hosting)

packages/
└── shared/                        # Shared types, Firebase config, auth logic
    └── src/types.ts               # Agency, Operation, Inspection, Invoice, etc.
```

### Key Components (apps/desktop/renderer/src/components/)

| Component | Purpose |
|-----------|---------|
| InspectionProgressBar | 6-step workflow: Scheduled → Prep → Inspected → Report → Invoiced → Paid |
| StepModal | Checklist + hours modal for Prep/Inspected/Report steps |
| InvoiceEditor | Full editable invoice with pre-calculated line items |
| InvoiceEmailModal | Gmail compose with agency template and PDF attachment |
| BusinessProfileTab | My Business settings (Firestore-backed) |
| AgencySettingsTab | Per-agency rates, checklists, email templates |
| RateConfigSection | Flat/hourly rate toggle with conditional fields |
| ChecklistEditor | Configurable prep/report checklist items |
| SignatureEditor | Rich HTML email signature with live preview |
| StickyNote | Quick note/task creation widget |
| UnifiedActivityFeed | Combined notes/tasks/activity feed |
| NearbyOperatorsModal | Distance-sorted nearby operators (Haversine) |
| OnboardingWizard | First-run setup: business profile, address, signature, first agency |

## Data Model

All user data lives under `/users/{userId}/` in Firestore (and mirrored in local SQLite):

| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `agencies` | Certifying agencies | name, billingAddress, isFlatRate, flatRateAmount, hourlyRate, driveTimeHourlyRate, mileageReimbursed, mileageRate, perDiemRate, perTypeRatesEnabled, ratesByType, billingEmail, emailTemplate*, prepChecklist*, reportChecklist*, defaultLineItems |
| `operations` | Operators you inspect | name, agencyId, address, contact, operationType, clientId, lat/lng, cachedDistanceMiles, cachedDriveTimeMinutes |
| `operation_activities` | Activity log per operator | operationId, type, description, timestamp |
| `inspections` | Inspection workflow records | operationId, date, status (Scheduled/Prep/Inspected/Report/Invoiced/Paid), prepHours, onsiteHours, reportHours, calculatedMileage, calculatedDriveTime, prepChecklistData, reportChecklistData |
| `invoices` | Generated invoices | inspectionId, agencyId, operationId, totalAmount, lineItems (JSON), status (Not Complete/Sent/Paid), sentDate, paidDate |
| `tasks` | Notes & follow-ups | title, status, dueDate, operationId, inspectionId |
| `notes` | Quick notes | content, operationId |
| `expenses` | Business expenses | date, vendor, amount, receipt image, category |
| `system_settings/config` | Business profile & settings | businessName, ownerName, address, irsMileageRate, emailSignatureHtml, homebaseLat/Lng, onboardingCompleted |

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
| `npm run dev` | Start desktop dev server (port 3000) |
| `npm run dev:mobile` | Start mobile dev server (port 3001) |
| `npm run build` | Build shared + desktop (Vite) |
| `npm run build:electron` | Build desktop + package Electron binary |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type checking (tsc --noEmit) |
| `npm run test` | Run Vitest test suite |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run clean` | Remove dist, dist-electron, out |

## License

Private — All rights reserved.
