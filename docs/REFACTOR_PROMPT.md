# DIOS Studio — Architectural Refactor Prompt

Paste everything below this line into a new Claude Code session.

---

## Context

You are working on **DIOS Studio** at `/home/chrishoran/Desktop/DIOS`. It is an inspection management platform for independent certified organic inspectors (or any field inspector). Inspectors use it to manage **agencies** (certifying bodies that hire them), **operators** (farms, handlers, processing plants they inspect), inspection scheduling, invoicing, expenses, documents, routing, emails, and tax reporting.

**Tech stack:** Vite 6 + React 19 + TypeScript 5.8 + Tailwind CSS 4, backed by Firebase 12 (Auth, Firestore, Storage) with Google Workspace integration (Drive, Gmail, Calendar, Sheets). The repo is cloned and dependencies are installed.

### Current architecture
- **Entry:** `src/main.tsx` → `src/App.tsx` (BrowserRouter, auth guard, PWA update banner)
- **Auth:** `src/contexts/AuthContext.tsx` — Google OAuth via Firebase `signInWithPopup`, GIS silent token refresh, token in localStorage
- **Sync:** `src/contexts/BackgroundSyncContext.tsx` + `src/lib/syncQueue.ts` — IndexedDB file upload queue with retry
- **Data:** All reads/writes go directly to Firestore via `onSnapshot` listeners in page components. Data at `/users/{userId}/[collection]/{docId}`
- **Pages (17):** Dashboard, Operations, OperationProfile, Inspections, InspectionProfile, Invoices, Expenses, Schedule, NotesTasks, Routing, Email, Reports, Insights, Drive, Sheets, MobileHub, Settings
- **Components:** Layout (sidebar + command palette), SetupWizard, ReceiptScanner, ProcessUploadModal, TasksWidget, LeafLogo
- **Libs:** configStore, syncQueue, driveSync, localFsSync, pdfGenerator (invoices + tax reports)
- **Utils:** googleApiClient (401 retry), geocodingUtils, firestoreErrorHandler
- **Firestore collections:** agencies, operations (sub: documents, activities), inspections, invoices, tasks, expenses, system_settings/config, notes, unassigned_uploads
- **Build:** Single 2.8 MB JS chunk, no code splitting

### Known issues
- XSS in Email.tsx (dangerouslySetInnerHTML, only strips `<script>`)
- Zero test coverage
- TS build error in OperationProfile.tsx:541 (onClick handler type mismatch)
- npm vulnerability: serialize-javascript RCE (via vite-plugin-pwa)
- OAuth token in localStorage
- Deprecated `enableIndexedDbPersistence()` in firebase.ts
- 30+ console.log statements
- No error boundaries
- Missing Firestore rules for `notes` and `unassigned_uploads`
- Package name is `react-example` v0.0.0
- `@google/genai` unused, dev deps mixed with prod deps

---

## The Pivot

Convert from a cloud-dependent web app into a hybrid system:

1. **Desktop App** (Electron) — Local-first, offline-capable. All data in local SQLite, syncs to cloud when online.
2. **Mobile Companion** (Web) — Lightweight SPA on Firebase Hosting for field photo/file uploads.

### Decisions already made
- **Electron** for desktop (Node.js compat, better-sqlite3, existing OAuth flow works unchanged)
- **Single-user only** — no shared data, each user owns their local DB + cloud backup
- **Keep all invoicing and tax reporting** — nothing removed
- **Maps online-only** — placeholder when offline, no offline tiles
- **Simplify "Inspection Report"** — status toggle ("Report Completed") instead of in-app editor
- **HashRouter** for desktop (not BrowserRouter)

---

## Requirements

### Phase 1: Project Restructuring & Build Targets
- Restructure into a monorepo workspace:
  - `apps/desktop/` — Electron wrapper around React/Vite dashboard
  - `apps/mobile/` — Lightweight Vite SPA for mobile browsers
  - `packages/shared/` — Shared types, utilities, Firebase config, auth
- Electron build pipeline via `electron-builder`: `.exe` (Windows), `.dmg` (macOS), `.AppImage` (Linux)
- Firebase Hosting config (`firebase.json`) for mobile web app
- Desktop: HashRouter instead of BrowserRouter
- Add route-level code splitting (`React.lazy` + `Suspense`)

### Phase 2: Unified Authentication
- Centralized Google OAuth shared across desktop and mobile
- Request all scopes upfront in one consent: Drive, Calendar, Gmail, Sheets, user profile
- Firebase Auth via `GoogleAuthProvider` on both platforms
- Desktop: OAuth via Electron BrowserWindow or system browser
- Mobile: Standard `signInWithPopup`

### Phase 3: Local-First Desktop (Offline Capability)
- **Local Database:** Replace Firestore `onSnapshot` with local SQLite via `better-sqlite3` + Electron IPC. All CRUD offline (operators, inspections, invoices, expenses, tasks, agencies, settings).
- **Local File Storage:** Documents save to disk via Node.js `fs` + IPC. Folder structure: `~/DIOS Studio/[operator]/[year]/[filename]`. No browser permission prompts.
- **Offline Maps:** Connection checks on OperationProfile and Routing pages. Offline = placeholder message. Add manual drag-and-drop stop reordering for routing.
- **Simplify Inspection Report:** Status toggle/checkbox instead of editor.

### Phase 4: Cloud Backup & Sync Engine
- Background sync in Electron main process
- When online: mirror local SQLite → Firestore, back up local files → Google Drive
- Sync direction: **local → cloud** (local is source of truth)
- Conflict resolution: last-write-wins via `updatedAt` timestamps (single-user, no real conflicts)
- `sync_status` table in SQLite (synced/pending/failed per record)
- UI sync indicator (green/yellow/red)
- Replaces existing `syncQueue.ts` IndexedDB queue

### Phase 5: Mobile Companion Web App
- Lightweight SPA on Firebase Hosting
- Screens: Login → Landing (Take Photo / Upload File) → Preview → Operation Selector → Upload → Success (green checkmark, auto-reset)
- `<input type="file" accept="image/*" capture="environment">` for camera
- Files → Firebase Storage/Drive, linked to selected operator
- Works on iOS Safari and Android Chrome

### Phase 6: Fix Known Issues
- XSS: DOMPurify in Email.tsx
- TS error: OperationProfile.tsx:541
- Deprecated `enableIndexedDbPersistence()`
- Remove console.log statements (replace with configurable logger)
- Add error boundaries
- Fix package.json: rename `dios-studio`, version `1.0.0`, fix dep categories, remove `@google/genai`
- Add Firestore rules for `notes` and `unassigned_uploads`
- `npm audit fix` for serialize-javascript

---

## Implementation Approach

- Read the full codebase before planning
- Create a detailed implementation plan before writing code
- Work phase by phase (1 → 2 → 3 → 4 → 5 → 6), each phase producing a buildable app
- Prefer editing existing files over creating new ones
- Immutable patterns, strict TypeScript (no `as any`), files under 800 lines

## Reference files
- `README.md` — Project documentation
- `PRODUCTION_BLOCKERS.md` — Full issue audit
- `firebase-blueprint.json` — Firestore schema
- `firestore.rules` — Security rules
