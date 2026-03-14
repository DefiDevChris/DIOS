# DIOS Studio Hybrid Pivot — Master Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert DIOS Studio from a cloud-only Vite+React web app into a hybrid system: an Electron desktop app (local-first with SQLite) and a lightweight mobile companion web app, organized as an npm-workspaces monorepo.

**Architecture:** npm workspaces monorepo with three packages: `apps/desktop` (Electron main + Vite renderer), `apps/mobile` (lightweight Vite SPA), and `packages/shared` (types, Firebase config, auth utilities). Desktop uses `better-sqlite3` for offline-first local data with background sync to Firestore/Drive. Mobile is a thin camera-upload SPA on Firebase Hosting. All existing features preserved — nothing removed.

**Tech Stack:** Electron 36 + electron-builder, Vite 6, React 19, TypeScript 5.8, Tailwind CSS 4, better-sqlite3, Firebase 12, Google APIs (Drive/Gmail/Calendar/Sheets/Maps), DOMPurify, Vitest.

---

## Overview: 6 Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| 1 | Project Restructuring & Build Targets | Monorepo with desktop Electron app + mobile SPA shell, code-split routes |
| 2 | Unified Authentication | Centralized OAuth shared by desktop and mobile |
| 3 | Local-First Desktop | SQLite database + local file storage + offline mode |
| 4 | Cloud Backup & Sync Engine | Background sync: local SQLite → Firestore, local files → Drive |
| 5 | Mobile Companion Web App | Camera/upload SPA on Firebase Hosting |
| 6 | Fix Known Issues | XSS, TS errors, console.logs, error boundaries, dep cleanup |

Each phase produces a buildable, runnable app. Phases are sequential — each depends on the prior phase being complete.

---

## Critical Implementation Notes (from plan review)

These issues were identified during plan review and are addressed inline in the relevant tasks:

1. **ESM/CJS mismatch in Electron main process** — main process tsconfig uses `"module": "ESNext"` with `.mjs` output extensions (Task 1.5)
2. **SQL injection in IPC bridge** — table names are validated against an allowlist; raw `db:query` IPC is removed (Task 3.1)
3. **`electron-rebuild` required for better-sqlite3** — added as postinstall script (Task 3.1)
4. **Firebase auto-initialization side effect** — barrel export does NOT re-export firebase.ts; consumers import it directly (Task 1.2)
5. **Mobile Firebase config bootstrap** — Firebase config baked as Vite env vars at build time, not via localStorage (Task 5.3)
6. **Firestore rules incomplete** — `googleCalendarEventId`, `reportCompleted` added to inspection rules; `receiptFileId`, `inspectionId`, `category` added to expense rules (Task 6.5)
7. **Dual sync mechanisms** — old `BackgroundSyncContext` + `syncQueue.ts` disabled when running in Electron; replaced by main process sync engine (Task 4.1)
8. **File-to-Drive sync** — sync engine handles both database records AND local files to Google Drive (Task 4.1)
9. **Use `git mv`** — file moves use `git mv` to preserve history (Task 1.3)
10. **Cloud-to-local pull for unassigned_uploads** — sync engine pulls mobile uploads from Firestore into local SQLite (Task 4.1)

---

## File Structure Map

### New files created by this plan

```
dios-studio/                          (root — renamed from DIOS)
├── package.json                      (root workspace config)
├── tsconfig.base.json                (shared TS config)
├── .gitignore                        (updated)
│
├── apps/
│   ├── desktop/
│   │   ├── package.json              (Electron + renderer deps)
│   │   ├── tsconfig.json             (extends base)
│   │   ├── vite.config.ts            (renderer build)
│   │   ├── electron-builder.yml      (packaging config)
│   │   ├── index.html                (moved from root)
│   │   ├── public/                   (moved from root)
│   │   │   └── icon.svg
│   │   ├── main/                     (Electron main process)
│   │   │   ├── index.ts              (entry: BrowserWindow + IPC)
│   │   │   ├── preload.ts            (contextBridge API)
│   │   │   ├── database.ts           (better-sqlite3 wrapper)
│   │   │   ├── schema.ts             (SQLite table definitions)
│   │   │   ├── fileStorage.ts        (local fs operations)
│   │   │   ├── syncEngine.ts         (background cloud sync)
│   │   │   └── tsconfig.json         (Node target)
│   │   └── renderer/                 (React app — current src/)
│   │       └── src/
│   │           ├── main.tsx           (moved)
│   │           ├── App.tsx            (modified: HashRouter, lazy routes)
│   │           ├── index.css          (moved)
│   │           ├── components/        (moved, modified)
│   │           ├── contexts/          (moved, modified)
│   │           ├── lib/               (moved, modified)
│   │           ├── pages/             (moved, modified)
│   │           ├── utils/             (moved, modified)
│   │           ├── types/             (moved)
│   │           └── hooks/             (new: useDatabase, useFileStorage, etc.)
│   │
│   └── mobile/
│       ├── package.json              (lightweight deps)
│       ├── tsconfig.json             (extends base)
│       ├── vite.config.ts            (mobile build)
│       ├── index.html                (mobile entry)
│       ├── public/
│       │   └── icon.svg
│       └── src/
│           ├── main.tsx              (entry)
│           ├── App.tsx               (3 screens)
│           ├── index.css             (Tailwind)
│           └── screens/
│               ├── Login.tsx
│               ├── Upload.tsx
│               └── Success.tsx
│
├── packages/
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json             (extends base)
│       ├── src/
│       │   ├── index.ts              (barrel export)
│       │   ├── types.ts              (all shared interfaces)
│       │   ├── firebase.ts           (Firebase init — from src/firebase.ts)
│       │   ├── configStore.ts        (from src/lib/configStore.ts)
│       │   ├── googleApiClient.ts    (from src/utils/googleApiClient.ts)
│       │   ├── logger.ts             (replaces console.log)
│       │   └── constants.ts          (shared constants)
│       └── vite.config.ts            (lib build)
│
├── firebase.json                     (hosting config for mobile)
├── firestore.rules                   (updated with notes + unassigned_uploads)
└── firebase-blueprint.json           (reference)
```

### Existing files that move (Phase 1)

| Current Path | New Path |
|---|---|
| `src/main.tsx` | `apps/desktop/renderer/src/main.tsx` |
| `src/App.tsx` | `apps/desktop/renderer/src/App.tsx` |
| `src/index.css` | `apps/desktop/renderer/src/index.css` |
| `src/firebase.ts` | `packages/shared/src/firebase.ts` |
| `src/lib/configStore.ts` | `packages/shared/src/configStore.ts` |
| `src/utils/googleApiClient.ts` | `packages/shared/src/googleApiClient.ts` |
| `src/lib/syncQueue.ts` | `apps/desktop/renderer/src/lib/syncQueue.ts` |
| `src/lib/driveSync.ts` | `apps/desktop/renderer/src/lib/driveSync.ts` |
| `src/lib/localFsSync.ts` | `apps/desktop/renderer/src/lib/localFsSync.ts` |
| `src/lib/pdfGenerator.ts` | `apps/desktop/renderer/src/lib/pdfGenerator.ts` |
| `src/utils/geocodingUtils.ts` | `apps/desktop/renderer/src/utils/geocodingUtils.ts` |
| `src/utils/firestoreErrorHandler.ts` | `apps/desktop/renderer/src/utils/firestoreErrorHandler.ts` |
| `src/contexts/*` | `apps/desktop/renderer/src/contexts/*` |
| `src/components/*` | `apps/desktop/renderer/src/components/*` |
| `src/pages/*` | `apps/desktop/renderer/src/pages/*` |
| `src/types/*` | `apps/desktop/renderer/src/types/*` |
| `index.html` | `apps/desktop/index.html` |
| `public/icon.svg` | `apps/desktop/public/icon.svg` |
| `vite.config.ts` | `apps/desktop/vite.config.ts` |

---

## Chunk 1: Phase 1 — Project Restructuring & Build Targets

### Task 1.1: Initialize Monorepo Root

**Files:**
- Modify: `package.json` (root workspace config)
- Create: `tsconfig.base.json` (shared TS config)
- Modify: `.gitignore` (add Electron build artifacts)

- [ ] **Step 1: Update root package.json to workspace root**

Replace the entire root `package.json` with a workspace-only config. All deps move to sub-packages.

```json
{
  "name": "dios-studio",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "dev": "npm run dev -w apps/desktop",
    "dev:mobile": "npm run dev -w apps/mobile",
    "build": "npm run build -w packages/shared && npm run build -w apps/desktop",
    "build:mobile": "npm run build -w packages/shared && npm run build -w apps/mobile",
    "lint": "npm run lint -w packages/shared && npm run lint -w apps/desktop",
    "clean": "npm run clean -w apps/desktop && npm run clean -w apps/mobile"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Update .gitignore**

Append these lines:

```
# Electron
dist-electron/
out/
*.exe
*.dmg
*.AppImage
*.snap
*.deb
*.rpm

# Workspace
node_modules/
apps/*/node_modules/
packages/*/node_modules/
apps/*/dist/
packages/*/dist/

# Environment files (contain secrets)
.env
.env.local
.env.*.local
```

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json .gitignore
git commit -m "chore: initialize npm workspaces monorepo root"
```

---

### Task 1.2: Create Shared Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vite.config.ts`
- Move: `src/firebase.ts` → `packages/shared/src/firebase.ts`
- Move: `src/lib/configStore.ts` → `packages/shared/src/configStore.ts`
- Move: `src/utils/googleApiClient.ts` → `packages/shared/src/googleApiClient.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/logger.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/shared/src
```

- [ ] **Step 2: Create packages/shared/package.json**

```json
{
  "name": "@dios/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "firebase": "^12.10.0"
  },
  "devDependencies": {
    "typescript": "~5.8.2"
  }
}
```

- [ ] **Step 3: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create packages/shared/src/logger.ts**

This replaces all `console.log` throughout the codebase. Log level is configurable.

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

let currentLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.debug(`[DIOS] ${message}`, ...args)
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(`[DIOS] ${message}`, ...args)
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(`[DIOS] ${message}`, ...args)
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(`[DIOS] ${message}`, ...args)
    }
  },
}
```

- [ ] **Step 5: Create packages/shared/src/constants.ts**

```typescript
export const FIRESTORE_COLLECTIONS = {
  AGENCIES: 'agencies',
  OPERATIONS: 'operations',
  INSPECTIONS: 'inspections',
  INVOICES: 'invoices',
  EXPENSES: 'expenses',
  TASKS: 'tasks',
  NOTES: 'notes',
  UNASSIGNED_UPLOADS: 'unassigned_uploads',
  SYSTEM_SETTINGS: 'system_settings',
  DOCUMENTS: 'documents',
  ACTIVITIES: 'activities',
} as const

export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
] as const

export const APP_NAME = 'DIOS Studio'
export const CONFIG_KEY = 'dois_studio_config'
export const TOKEN_KEY = 'googleAccessToken'
export const TOKEN_EXPIRY_KEY = 'googleAccessTokenExpiry'
```

- [ ] **Step 6: Create packages/shared/src/types.ts**

Extract shared interfaces used by both desktop and mobile. Read through all page files and collect every interface/type that is shared or could be shared.

```typescript
// Firebase config
export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

export interface AppConfig {
  firebaseConfig: FirebaseConfig
  googleMapsApiKey: string
  googleOAuthClientId?: string
}

// Domain models
export interface Agency {
  id: string
  name: string
  billingAddress: string
  flatRateBaseAmount: number
  flatRateIncludedHours: number
  additionalHourlyRate: number
  mileageRate: number
  travelTimeHourlyRate?: number
  perDiemRate?: number
}

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
  inspectionStatus?: 'prep' | 'scheduled' | 'inspected' | 'report' | 'invoiced' | 'paid'
  lat?: number
  lng?: number
}

export interface Inspection {
  id: string
  operationId: string
  date: string
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled'
  baseHoursLog: number
  additionalHoursLog: number
  milesDriven: number
  bundleId?: string
  notes?: string
  isBundled?: boolean
  totalTripDriveTime?: number
  totalTripStops?: number
  sharedDriveTime?: number
  mealsAndExpenses?: number
  perDiemDays?: number
  customLineItemName?: string
  customLineItemAmount?: number
  invoiceNotes?: string
  invoiceExceptions?: string
  reportCompleted?: boolean
  googleCalendarEventId?: string
}

export interface Invoice {
  id: string
  inspectionId: string
  agencyId: string
  totalAmount: number
  pdfDriveId: string
  status: 'Paid' | 'Unpaid'
}

export interface Expense {
  id: string
  date: string
  vendor: string
  amount: number
  notes?: string
  receiptImageUrl?: string
  receiptFileId?: string
  inspectionId?: string
  category?: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'completed'
  createdAt: string
  dueDate?: string
  operationId?: string
  inspectionId?: string
}

export interface OperationDocument {
  name: string
  size: number
  type: string
  uploadedAt: string
  url: string
}

export interface OperationActivity {
  type: string
  description: string
  timestamp: string
}

export interface UnassignedUpload {
  id: string
  fileName: string
  fileType: string
  fileUrl: string
  uploadedAt: string
  source: 'mobile' | 'desktop'
  operationId?: string
}

// Sync types (used in Phase 4)
export type SyncStatus = 'synced' | 'pending' | 'failed'

export interface SyncRecord {
  collection: string
  docId: string
  status: SyncStatus
  updatedAt: string
  lastSyncedAt?: string
  lastError?: string
}

// PDF types
export interface InvoiceData {
  invoiceNumber: string
  date: string
  billTo: { name: string; address: string }
  serviceFor: { name: string; address: string }
  baseRate: number
  baseHours: number
  additionalHours: number
  additionalRate: number
  driveTime: number
  driveTimeRate: number
  milesDriven: number
  mileageRate: number
  perDiemDays: number
  perDiemRate: number
  mealsAndExpenses: number
  customLineItemName?: string
  customLineItemAmount?: number
  notes?: string
  exceptions?: string
  totalAmount: number
}

export interface TaxReportData {
  year: number
  totalIncome: number
  expenses: Record<string, number>
  mileage: { totalMiles: number; rate: number; deduction: number }
}
```

- [ ] **Step 7: Move and update configStore.ts**

Copy `src/lib/configStore.ts` to `packages/shared/src/configStore.ts`. Update to use shared types and constants:

```typescript
import type { AppConfig } from './types'
import { CONFIG_KEY } from './constants'

export const configStore = {
  getConfig(): AppConfig | null {
    const data = localStorage.getItem(CONFIG_KEY)
    return data ? JSON.parse(data) as AppConfig : null
  },

  saveConfig(config: AppConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  },

  clearConfig(): void {
    localStorage.removeItem(CONFIG_KEY)
  },

  hasConfig(): boolean {
    return !!localStorage.getItem(CONFIG_KEY)
  },
}
```

- [ ] **Step 8: Move and update firebase.ts**

Copy `src/firebase.ts` to `packages/shared/src/firebase.ts`. Replace deprecated `enableIndexedDbPersistence` with `initializeFirestore` + `persistentLocalCache`:

```typescript
import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
} from 'firebase/firestore'
import { getStorage, FirebaseStorage } from 'firebase/storage'
import { configStore } from './configStore'
import { logger } from './logger'
import type { FirebaseConfig } from './types'

export let app: FirebaseApp | null = null
export let db: Firestore | null = null
export let auth: Auth | null = null
export let storage: FirebaseStorage | null = null
export let isInitialized = false

export function initializeFirebase(config?: FirebaseConfig): boolean {
  const firebaseConfig = config ?? configStore.getConfig()?.firebaseConfig

  if (!firebaseConfig) {
    logger.warn('Cannot initialize Firebase: No config found.')
    return false
  }

  try {
    const apps = getApps()
    const existingApp = apps.find((a) => a.name === '[DEFAULT]')

    app = existingApp ?? initializeApp(firebaseConfig)
    auth = getAuth(app)
    storage = getStorage(app)

    // Use modern persistent cache API (replaces deprecated enableIndexedDbPersistence)
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })

    isInitialized = true
    return true
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error)
    isInitialized = false
    return false
  }
}

// Auto-initialize if config exists
if (configStore.hasConfig()) {
  initializeFirebase()
}
```

- [ ] **Step 9: Move googleApiClient.ts**

Copy `src/utils/googleApiClient.ts` to `packages/shared/src/googleApiClient.ts`. Replace `console.warn/error` with logger:

```typescript
import { logger } from './logger'
import { TOKEN_KEY } from './constants'

type TokenRefresher = () => Promise<string>
let _refreshToken: TokenRefresher | null = null

export function registerTokenRefresher(fn: TokenRefresher): void {
  _refreshToken = fn
}

export async function googleApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, { ...init, headers })

  if (response.status === 401 && _refreshToken) {
    try {
      const newToken = await _refreshToken()
      localStorage.setItem(TOKEN_KEY, newToken)
      headers.set('Authorization', `Bearer ${newToken}`)
      return fetch(input, { ...init, headers })
    } catch (err) {
      logger.error('Token refresh failed during 401 retry', err)
    }
  } else if (response.status === 401) {
    logger.warn('401 received but no token refresher registered')
  }

  return response
}

export async function googleApiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await googleApiFetch(input, init)
  if (!res.ok) {
    throw new Error(`Google API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 10: Create barrel export packages/shared/src/index.ts**

**IMPORTANT:** Do NOT re-export `firebase.ts` from the barrel. Firebase has module-level side effects (auto-initialization). Consumers must import firebase directly: `import { db, auth } from '@dios/shared/src/firebase'`. This prevents accidental Firebase init when only importing logger or types.

```typescript
export { configStore } from './configStore'
// NOTE: firebase.ts is NOT re-exported here to avoid side-effect auto-initialization.
// Import directly: import { db, auth, initializeFirebase } from '@dios/shared/src/firebase'
export { registerTokenRefresher, googleApiFetch, googleApiJson } from './googleApiClient'
export { logger, setLogLevel } from './logger'
export * from './types'
export * from './constants'
```

- [ ] **Step 11: Commit**

```bash
git add packages/shared/
git commit -m "feat: create @dios/shared package with types, firebase, logger, and config"
```

---

### Task 1.3: Create Desktop App Structure

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Move: `vite.config.ts` → `apps/desktop/vite.config.ts` (modified)
- Move: `index.html` → `apps/desktop/index.html`
- Move: `public/` → `apps/desktop/public/`
- Move: `src/` → `apps/desktop/renderer/src/`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/desktop/renderer/src
mkdir -p apps/desktop/main
mkdir -p apps/desktop/public
```

- [ ] **Step 2: Move source files using git mv (preserves history)**

```bash
# Move renderer source (git mv preserves history)
git mv src/components apps/desktop/renderer/src/
git mv src/contexts apps/desktop/renderer/src/
git mv src/lib apps/desktop/renderer/src/
git mv src/pages apps/desktop/renderer/src/
git mv src/utils apps/desktop/renderer/src/
git mv src/types apps/desktop/renderer/src/
git mv src/main.tsx apps/desktop/renderer/src/
git mv src/App.tsx apps/desktop/renderer/src/
git mv src/index.css apps/desktop/renderer/src/
git mv src/vite-pwa.d.ts apps/desktop/renderer/src/

# Move firebase.ts to shared (already created in Task 1.2, so just remove old)
git rm src/firebase.ts
git rm src/lib/configStore.ts
git rm src/utils/googleApiClient.ts

# Move HTML + public assets
git mv index.html apps/desktop/
git mv public/icon.svg apps/desktop/public/

# Move config (will be overwritten next step)
git mv vite.config.ts apps/desktop/
```

**Note:** `src/firebase.ts`, `src/lib/configStore.ts`, and `src/utils/googleApiClient.ts` were already recreated in `packages/shared/src/` in Task 1.2. The `git rm` here removes the old copies.

- [ ] **Step 3: Create apps/desktop/package.json**

```json
{
  "name": "@dios/desktop",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev": "vite",
    "dev:electron": "electron .",
    "build": "vite build",
    "build:electron": "npm run build && electron-builder",
    "preview": "vite preview",
    "clean": "rm -rf dist dist-electron out",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@dios/shared": "*",
    "@react-google-maps/api": "^2.20.8",
    "date-fns": "^4.1.0",
    "gapi-script": "^1.2.0",
    "html2canvas": "^1.4.1",
    "idb": "^8.0.3",
    "jspdf": "^4.2.0",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "papaparse": "^5.5.3",
    "react": "^19.0.0",
    "react-big-calendar": "^1.19.4",
    "react-dom": "^19.0.0",
    "react-router": "^7.13.1",
    "recharts": "^3.8.0",
    "sweetalert2": "^11.26.22",
    "tesseract.js": "^7.0.0",
    "dompurify": "^3.2.6"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@types/dompurify": "^3.2.0",
    "@types/gapi": "^0.0.47",
    "@types/gapi.client.calendar": "^3.0.12",
    "@types/gapi.client.drive": "^3.0.15",
    "@types/gapi.client.drive-v3": "^0.0.5",
    "@types/gapi.client.gmail": "^1.0.5",
    "@types/node": "^22.14.0",
    "@types/papaparse": "^5.5.2",
    "@types/react-big-calendar": "^1.16.3",
    "@vitejs/plugin-react": "^5.0.4",
    "autoprefixer": "^10.4.21",
    "electron": "^36.0.0",
    "electron-builder": "^26.0.0",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

Note: `vite-plugin-pwa` removed (PWA not needed in Electron). `@google/genai` removed (unused). `dotenv` removed (Electron uses env natively). `express` removed (not needed). `dompurify` added for XSS fix. `idb` kept temporarily for browser-dev Firestore fallback — `syncQueue.ts` is disabled in Electron mode (see Phase 4 Task 4.1).

- [ ] **Step 4: Create apps/desktop/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@dios/shared": ["../../packages/shared/src"],
      "@/*": ["./renderer/src/*"]
    }
  },
  "include": ["renderer/src"],
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

- [ ] **Step 5: Update apps/desktop/vite.config.ts**

Replace the existing vite.config.ts content. Remove PWA plugin, update paths, update alias:

```typescript
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer/src'),
      '@dios/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
  },
})
```

- [ ] **Step 6: Update apps/desktop/index.html**

Update the script src path:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#D49A6A" />
    <meta name="description" content="DIOS Studio - Field Inspector CRM &amp; Routing Dashboard" />
    <title>DIOS Studio</title>
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/icon.svg" />
    <script src="https://accounts.google.com/gsi/client" async defer></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/renderer/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Update all import paths in moved files**

Every file that imports from `../firebase`, `../lib/configStore`, or `../utils/googleApiClient` must be updated to import from `@dios/shared` instead.

Files to update (search for these import patterns):

1. **Imports of `../firebase` or `../../firebase`:** Update to `import { db, auth, storage } from '@dios/shared/src/firebase'` (direct import, NOT via barrel — see Task 1.2 Step 10 note about side effects)
   - Every page file (18 files)
   - `contexts/AuthContext.tsx`
   - `contexts/BackgroundSyncContext.tsx`
   - `components/Layout.tsx`
   - `components/SetupWizard.tsx`
   - `components/TasksWidget.tsx`
   - `components/ProcessUploadModal.tsx`
   - `lib/syncQueue.ts`
   - `lib/driveSync.ts`
   - `utils/firestoreErrorHandler.ts`
   - `utils/geocodingUtils.ts`

2. **Imports of `configStore`:** Update to `import { configStore } from '@dios/shared'`
   - `App.tsx`
   - `components/SetupWizard.tsx`
   - `contexts/AuthContext.tsx`
   - `utils/geocodingUtils.ts`

3. **Imports of `googleApiClient`:** Update to `import { googleApiFetch, googleApiJson, registerTokenRefresher } from '@dios/shared'`
   - `contexts/AuthContext.tsx`
   - Any page that calls `googleApiFetch` or `googleApiJson`

4. **Remove the old source files** (`src/firebase.ts`, `src/lib/configStore.ts`, `src/utils/googleApiClient.ts`) since they now live in `packages/shared/`.

- [ ] **Step 8: Verify build**

```bash
cd apps/desktop && npx vite build
```

Expected: Build succeeds (or only the pre-existing TS error in OperationProfile.tsx:541 fails).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/ packages/shared/
git rm -r src/ index.html public/ vite.config.ts tsconfig.json
git commit -m "feat: restructure into monorepo with apps/desktop and packages/shared"
```

---

### Task 1.4: Add Route-Level Code Splitting

**Files:**
- Modify: `apps/desktop/renderer/src/App.tsx`

- [ ] **Step 1: Convert App.tsx to use HashRouter + React.lazy**

Replace the entire `App.tsx` content. Key changes:
- `BrowserRouter` → `HashRouter` (required for Electron file:// protocol)
- All 17 page imports → `React.lazy()` dynamic imports
- Wrap routes in `<Suspense>` with a loading fallback
- Remove PWA update banner (not needed in Electron)

```tsx
import { HashRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { BackgroundSyncProvider } from './contexts/BackgroundSyncContext'
import Layout from './components/Layout'
import { configStore } from '@dios/shared'
import { useState, useEffect, Suspense, lazy } from 'react'
import SetupWizard from './components/SetupWizard'

// Route-level code splitting
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Settings = lazy(() => import('./pages/Settings'))
const Operations = lazy(() => import('./pages/Operations'))
const OperationProfile = lazy(() => import('./pages/OperationProfile'))
const Inspections = lazy(() => import('./pages/Inspections'))
const InspectionProfile = lazy(() => import('./pages/InspectionProfile'))
const Routing = lazy(() => import('./pages/Routing'))
const NotesTasks = lazy(() => import('./pages/NotesTasks'))
const MobileHub = lazy(() => import('./pages/MobileHub'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Invoices = lazy(() => import('./pages/Invoices'))
const Reports = lazy(() => import('./pages/Reports'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Email = lazy(() => import('./pages/Email'))
const Insights = lazy(() => import('./pages/Insights'))
const Drive = lazy(() => import('./pages/Drive'))
const Sheets = lazy(() => import('./pages/Sheets'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6]">
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64 text-stone-400">
      Loading...
    </div>
  )
}

export default function App() {
  const [hasConfig, setHasConfig] = useState(configStore.hasConfig())

  useEffect(() => {
    const handleStorageChange = () => {
      setHasConfig(configStore.hasConfig())
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  if (!hasConfig) {
    return <SetupWizard onComplete={() => window.location.reload()} />
  }

  return (
    <AuthProvider>
      <BackgroundSyncProvider>
        <HashRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="operations" element={<Operations />} />
                <Route path="operations/:id" element={<OperationProfile />} />
                <Route path="inspections" element={<Inspections />} />
                <Route path="inspections/:id" element={<InspectionProfile />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="notes" element={<NotesTasks />} />
                <Route path="email" element={<Email />} />
                <Route path="routing" element={<Routing />} />
                <Route path="reports" element={<Reports />} />
                <Route path="insights" element={<Insights />} />
                <Route path="drive" element={<Drive />} />
                <Route path="sheets" element={<Sheets />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </Suspense>
        </HashRouter>
      </BackgroundSyncProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 2: Verify dev server starts**

```bash
cd apps/desktop && npm run dev
```

Expected: Vite dev server starts on port 3000. Routes load lazily.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/App.tsx
git commit -m "feat: add HashRouter and route-level code splitting with React.lazy"
```

---

### Task 1.5: Electron Main Process Shell

**Files:**
- Create: `apps/desktop/main/index.ts`
- Create: `apps/desktop/main/preload.ts`
- Create: `apps/desktop/main/tsconfig.json`
- Create: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Create apps/desktop/main/tsconfig.json**

**IMPORTANT:** The root `package.json` has `"type": "module"`. Using `"module": "CommonJS"` would output `require()` calls in `.js` files, but Node.js in ESM mode treats `.js` as ESM — this would crash with `require is not defined`. Solution: use ESNext module and let Electron handle ESM natively (Electron 28+ supports ESM).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "../dist-electron/main",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": false
  },
  "include": ["."]
}
```

- [ ] **Step 2: Create apps/desktop/main/preload.ts**

Minimal preload script. Will be expanded in Phase 3 (SQLite IPC) and Phase 4 (sync IPC).

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Phase 3 will add: database operations
  // Phase 4 will add: sync operations

  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  isOnline: (): Promise<boolean> => ipcRenderer.invoke('app:isOnline'),
})
```

- [ ] **Step 3: Create apps/desktop/main/index.ts**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'DIOS Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC handlers
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:isOnline', () => {
  const { net } = require('electron')
  return net.isOnline()
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
```

- [ ] **Step 4: Create apps/desktop/electron-builder.yml**

```yaml
appId: com.dios.studio
productName: DIOS Studio
copyright: Copyright 2026

directories:
  output: out
  buildResources: public

files:
  - dist/**/*
  - dist-electron/**/*
  - public/**/*

win:
  target: nsis
  icon: public/icon.svg

mac:
  target: dmg
  icon: public/icon.svg
  category: public.app-category.business

linux:
  target: AppImage
  icon: public/icon.svg
  category: Office
```

- [ ] **Step 5: Add electron dev script to desktop package.json**

Update the `scripts` section to include Electron compilation:

```json
"scripts": {
  "dev": "vite",
  "dev:electron": "tsc -p main/tsconfig.json && electron .",
  "build": "vite build",
  "build:electron": "tsc -p main/tsconfig.json && vite build && electron-builder",
  "preview": "vite preview",
  "clean": "rm -rf dist dist-electron out",
  "lint": "tsc --noEmit"
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/main/ apps/desktop/electron-builder.yml apps/desktop/package.json
git commit -m "feat: add Electron main process shell with preload and builder config"
```

---

### Task 1.6: Create Mobile App Shell

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/vite.config.ts`
- Create: `apps/mobile/index.html`
- Create: `apps/mobile/public/icon.svg`
- Create: `apps/mobile/src/main.tsx`
- Create: `apps/mobile/src/App.tsx`
- Create: `apps/mobile/src/index.css`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p apps/mobile/src/screens apps/mobile/public
cp apps/desktop/public/icon.svg apps/mobile/public/
```

- [ ] **Step 2: Create apps/mobile/package.json**

```json
{
  "name": "@dios/mobile",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port=3001",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@dios/shared": "*",
    "firebase": "^12.10.0",
    "lucide-react": "^0.546.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "autoprefixer": "^10.4.21",
    "tailwindcss": "^4.1.14",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 3: Create apps/mobile/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@dios/shared": ["../../packages/shared/src"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

- [ ] **Step 4: Create apps/mobile/vite.config.ts**

```typescript
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: __dirname,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@dios/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3001,
  },
})
```

- [ ] **Step 5: Create apps/mobile/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#D49A6A" />
    <meta name="description" content="DIOS Studio Mobile - Field Upload Companion" />
    <title>DIOS Studio Mobile</title>
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <link rel="apple-touch-icon" href="/icon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create apps/mobile/src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create apps/mobile/src/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 8: Create apps/mobile/src/App.tsx**

Placeholder shell — full implementation in Phase 5.

```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-stone-800">DIOS Studio Mobile</h1>
        <p className="text-stone-500 mt-2">Field upload companion — coming soon</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Create firebase.json for mobile hosting**

At project root:

```json
{
  "hosting": {
    "public": "apps/mobile/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

- [ ] **Step 10: Install all workspace dependencies**

```bash
cd /home/chrishoran/Desktop/DIOS && npm install
```

- [ ] **Step 11: Verify both apps build**

```bash
npm run dev -w apps/desktop   # Should start on port 3000
npm run dev -w apps/mobile    # Should start on port 3001
```

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/ firebase.json
git commit -m "feat: create mobile companion app shell with Firebase Hosting config"
```

---

### Task 1.7: Clean Up Remaining Root Files and Verify

Since Task 1.3 Step 2 used `git mv`, the old `src/`, `index.html`, `public/`, and `vite.config.ts` are already moved (not copied). Only the old `tsconfig.json` remains (it was copied, not moved, since it's being replaced by `tsconfig.base.json`).

**Files:**
- Delete: `tsconfig.json` (replaced by tsconfig.base.json)
- Keep: `firestore.rules`, `firebase-blueprint.json`, `README.md`, `PRODUCTION_BLOCKERS.md`, `docs/`

- [ ] **Step 1: Remove old tsconfig and verify no stale files remain**

```bash
rm -f tsconfig.json
# Verify src/ is gone (should have been moved by git mv)
ls src/ 2>/dev/null && echo "ERROR: src/ still exists" || echo "OK: src/ removed"
```

- [ ] **Step 2: Run npm install to set up workspace symlinks**

```bash
cd /home/chrishoran/Desktop/DIOS && npm install
```

- [ ] **Step 3: Verify workspace root scripts work**

```bash
npm run dev            # Should proxy to apps/desktop dev
npm run dev:mobile     # Should proxy to apps/mobile dev
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: clean up remaining root files after monorepo restructure"
```

---

## Phase 1 Checkpoint

At this point you should have:
- [x] Monorepo with `apps/desktop`, `apps/mobile`, `packages/shared`
- [x] Desktop app runs in browser via `npm run dev` with HashRouter
- [x] Route-level code splitting (React.lazy + Suspense)
- [x] Mobile shell runs via `npm run dev:mobile`
- [x] Electron main process compiles (not yet wired to build pipeline)
- [x] Shared package with types, firebase, logger, config
- [x] All old source files cleaned up

---

## Chunk 2: Phase 2 — Unified Authentication

### Task 2.1: Consolidate OAuth Scopes

**Files:**
- Modify: `apps/desktop/renderer/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Update AuthContext to request all scopes upfront**

In `AuthContext.tsx`, find the `SCOPES` constant (or the scope string passed to GIS/Firebase) and replace with the full list from `@dios/shared`:

```typescript
import { OAUTH_SCOPES } from '@dios/shared'

// Replace the existing scope string:
const SCOPE_STRING = OAUTH_SCOPES.join(' ')
```

Find every place scopes are passed:
- `google.accounts.oauth2.initTokenClient({ scope: ... })` — use `SCOPE_STRING`
- `GoogleAuthProvider` — add scopes via `provider.addScope()`

In the `signInWithGoogle` function, update the GoogleAuthProvider setup:

```typescript
const provider = new GoogleAuthProvider()
for (const scope of OAUTH_SCOPES) {
  provider.addScope(scope)
}
```

- [ ] **Step 2: Replace console.log/warn/error with logger**

In `AuthContext.tsx`, replace:
- `console.warn("Local Demo Mode: Bypassing Auth")` → `logger.warn('Local Demo Mode: Bypassing Auth')`
- `console.error("Error signing in with Google", error)` → `logger.error('Error signing in with Google', error)`
- `console.error("Error signing out", error)` → `logger.error('Error signing out', error)`

Add import: `import { logger } from '@dios/shared'`

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/contexts/AuthContext.tsx
git commit -m "feat: consolidate OAuth scopes and replace console.log with logger"
```

---

### Task 2.2: Electron OAuth Window (Desktop)

**Files:**
- Modify: `apps/desktop/main/index.ts`
- Modify: `apps/desktop/main/preload.ts`
- Modify: `apps/desktop/renderer/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add OAuth IPC to preload.ts**

Add to the `contextBridge.exposeInMainWorld` call:

```typescript
// Auth
openOAuthWindow: (url: string): Promise<string> =>
  ipcRenderer.invoke('auth:openOAuthWindow', url),
```

- [ ] **Step 2: Add OAuth window handler to main/index.ts**

```typescript
import { app, BrowserWindow, ipcMain, net } from 'electron'

// ... existing code ...

// OAuth popup window for desktop
ipcMain.handle('auth:openOAuthWindow', async (_event, authUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow ?? undefined,
      modal: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    authWindow.loadURL(authUrl)

    authWindow.webContents.on('will-redirect', (_event, url) => {
      // Capture the redirect URL containing the auth code
      if (url.startsWith('http://localhost') || url.includes('/__/auth/handler')) {
        resolve(url)
        authWindow.close()
      }
    })

    authWindow.on('closed', () => {
      reject(new Error('Auth window was closed'))
    })
  })
})
```

- [ ] **Step 3: Add Electron detection to AuthContext**

At the top of `AuthContext.tsx`, add a type declaration and detection:

```typescript
declare global {
  interface Window {
    electronAPI?: {
      platform: string
      getVersion: () => Promise<string>
      isOnline: () => Promise<boolean>
      openOAuthWindow?: (url: string) => Promise<string>
    }
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
```

The existing `signInWithPopup` flow works in both Electron and browser. No changes needed to the Firebase auth flow — Electron can use the popup approach via its embedded Chromium. The `openOAuthWindow` IPC is available as a fallback if the popup flow is blocked.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/main/ apps/desktop/renderer/src/contexts/AuthContext.tsx
git commit -m "feat: add Electron OAuth window support for desktop auth"
```

---

## Phase 2 Checkpoint

At this point you should have:
- [x] All OAuth scopes requested upfront in single consent
- [x] Electron can open OAuth window via IPC
- [x] Firebase Auth works in both desktop (Electron) and browser
- [x] Logger replaces console.log in AuthContext

---

## Chunk 3: Phase 3 — Local-First Desktop (Offline Capability)

### Task 3.1: SQLite Database Layer

**Files:**
- Create: `apps/desktop/main/schema.ts`
- Create: `apps/desktop/main/database.ts`

- [ ] **Step 1: Install better-sqlite3**

```bash
npm install better-sqlite3 -w apps/desktop
npm install @types/better-sqlite3 -D -w apps/desktop
```

- [ ] **Step 2: Create apps/desktop/main/schema.ts**

All table definitions. Mirrors Firestore collections exactly.

```typescript
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
```

- [ ] **Step 3: Create apps/desktop/main/database.ts**

```typescript
import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { CREATE_TABLES, SCHEMA_VERSION } from './schema'

let dbInstance: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance

  const dbPath = path.join(app.getPath('userData'), 'dios-studio.db')
  dbInstance = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')

  // Initialize schema
  dbInstance.exec(CREATE_TABLES)

  return dbInstance
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

// SECURITY: Allowlisted table names to prevent SQL injection via IPC.
// The renderer process sends table names over IPC — a compromised renderer
// could send "agencies; DROP TABLE agencies; --" without this check.
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

// Generic CRUD operations exposed via IPC

export function findAll(table: string, filters?: Record<string, unknown>): unknown[] {
  const validTable = validateTable(table)
  const db = getDatabase()
  if (!filters || Object.keys(filters).length === 0) {
    return db.prepare(`SELECT * FROM ${validTable}`).all()
  }
  // Validate filter keys against alphanumeric pattern to prevent injection
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

// NOTE: Raw `query()` and `run()` functions are intentionally NOT exposed
// via IPC. Exposing arbitrary SQL to the renderer process is a SQL injection
// vector. All database access from the renderer goes through findAll/findById/
// upsert/remove which use allowlisted table names.
```

- [ ] **Step 4: Add electron-rebuild for better-sqlite3**

`better-sqlite3` is a native C++ addon that must be rebuilt against Electron's Node.js version. Add to `apps/desktop/package.json`:

```json
"scripts": {
  ...
  "postinstall": "electron-rebuild -f -w better-sqlite3"
},
"devDependencies": {
  ...
  "@electron/rebuild": "^4.0.0"
}
```

Also add `better-sqlite3` to dependencies:

```json
"dependencies": {
  ...
  "better-sqlite3": "^11.0.0"
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/main/schema.ts apps/desktop/main/database.ts apps/desktop/package.json
git commit -m "feat: add SQLite database layer with schema, CRUD, and table allowlisting"
```

---

### Task 3.2: Database IPC Bridge

**Files:**
- Modify: `apps/desktop/main/index.ts`
- Modify: `apps/desktop/main/preload.ts`
- Create: `apps/desktop/renderer/src/hooks/useDatabase.ts`

- [ ] **Step 1: Register database IPC handlers in main/index.ts**

Add after the existing IPC handlers:

```typescript
import { findAll, findById, upsert, remove, getDatabase, closeDatabase } from './database'

// Database IPC handlers — NO raw query/run exposed (SQL injection risk)
ipcMain.handle('db:findAll', (_event, table: string, filters?: Record<string, unknown>) =>
  findAll(table, filters)
)

ipcMain.handle('db:findById', (_event, table: string, id: string) =>
  findById(table, id)
)

ipcMain.handle('db:upsert', (_event, table: string, record: Record<string, unknown>) => {
  upsert(table, record)
  return { success: true }
})

ipcMain.handle('db:remove', (_event, table: string, id: string) => {
  remove(table, id)
  return { success: true }
})

// Close database on app quit
app.on('before-quit', () => {
  closeDatabase()
})
```

- [ ] **Step 2: Expose database IPC in preload.ts**

Update the `contextBridge.exposeInMainWorld` call:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // App info
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  isOnline: (): Promise<boolean> => ipcRenderer.invoke('app:isOnline'),

  // Auth
  openOAuthWindow: (url: string): Promise<string> =>
    ipcRenderer.invoke('auth:openOAuthWindow', url),

  // Database
  db: {
    findAll: (table: string, filters?: Record<string, unknown>): Promise<unknown[]> =>
      ipcRenderer.invoke('db:findAll', table, filters),
    findById: (table: string, id: string): Promise<unknown | undefined> =>
      ipcRenderer.invoke('db:findById', table, id),
    upsert: (table: string, record: Record<string, unknown>): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:upsert', table, record),
    remove: (table: string, id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('db:remove', table, id),
    // NOTE: No raw query/run exposed — SQL injection risk. All access via CRUD methods.
  },
})
```

- [ ] **Step 3: Create renderer/src/hooks/useDatabase.ts**

This hook abstracts the IPC calls and falls back to Firestore when not in Electron (for browser dev).

```typescript
import { useCallback } from 'react'
import { collection, doc, setDoc, deleteDoc, getDocs, getDoc } from 'firebase/firestore'
import { db as firestoreDb } from '@dios/shared/src/firebase'
import { useAuth } from '../contexts/AuthContext'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.db

interface UseDatabaseOptions {
  table: string
}

export function useDatabase<T extends { id: string }>({ table }: UseDatabaseOptions) {
  const { user } = useAuth()
  const userId = user?.uid

  const findAll = useCallback(async (filters?: Record<string, unknown>): Promise<T[]> => {
    if (isElectron) {
      return window.electronAPI!.db.findAll(table, filters) as Promise<T[]>
    }
    // Firestore fallback
    if (!firestoreDb || !userId) return []
    const colRef = collection(firestoreDb, `users/${userId}/${table}`)
    const snapshot = await getDocs(colRef)
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
  }, [table, userId])

  const findById = useCallback(async (id: string): Promise<T | null> => {
    if (isElectron) {
      const result = await window.electronAPI!.db.findById(table, id)
      return (result as T) ?? null
    }
    if (!firestoreDb || !userId) return null
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, id)
    const snapshot = await getDoc(docRef)
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null
  }, [table, userId])

  const save = useCallback(async (record: T): Promise<void> => {
    if (isElectron) {
      await window.electronAPI!.db.upsert(table, record as Record<string, unknown>)
      return
    }
    if (!firestoreDb || !userId) return
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, record.id)
    await setDoc(docRef, record)
  }, [table, userId])

  const remove = useCallback(async (id: string): Promise<void> => {
    if (isElectron) {
      await window.electronAPI!.db.remove(table, id)
      return
    }
    if (!firestoreDb || !userId) return
    const docRef = doc(firestoreDb, `users/${userId}/${table}`, id)
    await deleteDoc(docRef)
  }, [table, userId])

  return { findAll, findById, save, remove }
}
```

- [ ] **Step 4: Update Window type declaration**

Update the global declaration in `AuthContext.tsx` (or create a new `types/electron.d.ts`):

```typescript
declare global {
  interface Window {
    electronAPI?: {
      platform: string
      getVersion: () => Promise<string>
      isOnline: () => Promise<boolean>
      openOAuthWindow?: (url: string) => Promise<string>
      db: {
        findAll: (table: string, filters?: Record<string, unknown>) => Promise<unknown[]>
        findById: (table: string, id: string) => Promise<unknown | undefined>
        upsert: (table: string, record: Record<string, unknown>) => Promise<{ success: boolean }>
        remove: (table: string, id: string) => Promise<{ success: boolean }>
      }
    }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/main/ apps/desktop/renderer/src/hooks/
git commit -m "feat: add database IPC bridge with useDatabase hook and Firestore fallback"
```

---

### Task 3.3: Local File Storage

**Files:**
- Create: `apps/desktop/main/fileStorage.ts`
- Modify: `apps/desktop/main/index.ts` (add IPC handlers)
- Modify: `apps/desktop/main/preload.ts` (expose file operations)
- Create: `apps/desktop/renderer/src/hooks/useFileStorage.ts`

- [ ] **Step 1: Create apps/desktop/main/fileStorage.ts**

```typescript
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const BASE_DIR = path.join(app.getPath('home'), 'DIOS Studio')

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function getFilePath(operationName: string, year: string, fileName: string): string {
  const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_')
  return path.join(BASE_DIR, sanitize(operationName), sanitize(year), sanitize(fileName))
}

export function saveFile(
  operationName: string,
  year: string,
  fileName: string,
  data: Buffer,
): string {
  const filePath = getFilePath(operationName, year, fileName)
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, data)
  return filePath
}

export function readFile(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath)
  } catch {
    return null
  }
}

export function deleteFile(filePath: string): boolean {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}

export function listFiles(operationName: string, year?: string): string[] {
  const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, '_')
  const dir = year
    ? path.join(BASE_DIR, sanitize(operationName), sanitize(year))
    : path.join(BASE_DIR, sanitize(operationName))

  if (!fs.existsSync(dir)) return []

  const results: string[] = []
  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else {
        results.push(fullPath)
      }
    }
  }
  walk(dir)
  return results
}

export function getBaseDir(): string {
  return BASE_DIR
}
```

- [ ] **Step 2: Add file storage IPC handlers to main/index.ts**

```typescript
import { saveFile, readFile, deleteFile, listFiles, getBaseDir } from './fileStorage'

ipcMain.handle('fs:saveFile', (_event, operationName: string, year: string, fileName: string, data: ArrayBuffer) => {
  const filePath = saveFile(operationName, year, fileName, Buffer.from(data))
  return filePath
})

ipcMain.handle('fs:readFile', (_event, filePath: string) => {
  const data = readFile(filePath)
  return data ? data.buffer : null
})

ipcMain.handle('fs:deleteFile', (_event, filePath: string) => deleteFile(filePath))

ipcMain.handle('fs:listFiles', (_event, operationName: string, year?: string) =>
  listFiles(operationName, year)
)

ipcMain.handle('fs:getBaseDir', () => getBaseDir())
```

- [ ] **Step 3: Expose file operations in preload.ts**

Add to the `electronAPI` object:

```typescript
// File storage
fs: {
  saveFile: (opName: string, year: string, fileName: string, data: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke('fs:saveFile', opName, year, fileName, data),
  readFile: (filePath: string): Promise<ArrayBuffer | null> =>
    ipcRenderer.invoke('fs:readFile', filePath),
  deleteFile: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),
  listFiles: (opName: string, year?: string): Promise<string[]> =>
    ipcRenderer.invoke('fs:listFiles', opName, year),
  getBaseDir: (): Promise<string> =>
    ipcRenderer.invoke('fs:getBaseDir'),
},
```

- [ ] **Step 4: Create renderer/src/hooks/useFileStorage.ts**

```typescript
import { useCallback } from 'react'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.fs

export function useFileStorage() {
  const saveFile = useCallback(async (
    operationName: string,
    year: string,
    fileName: string,
    data: ArrayBuffer,
  ): Promise<string | null> => {
    if (!isElectron) return null
    return window.electronAPI!.fs.saveFile(operationName, year, fileName, data)
  }, [])

  const readFile = useCallback(async (filePath: string): Promise<ArrayBuffer | null> => {
    if (!isElectron) return null
    return window.electronAPI!.fs.readFile(filePath)
  }, [])

  const deleteFile = useCallback(async (filePath: string): Promise<boolean> => {
    if (!isElectron) return false
    return window.electronAPI!.fs.deleteFile(filePath)
  }, [])

  const listFiles = useCallback(async (
    operationName: string,
    year?: string,
  ): Promise<string[]> => {
    if (!isElectron) return []
    return window.electronAPI!.fs.listFiles(operationName, year)
  }, [])

  return { saveFile, readFile, deleteFile, listFiles, isAvailable: isElectron }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/main/fileStorage.ts apps/desktop/renderer/src/hooks/useFileStorage.ts
git commit -m "feat: add local file storage with IPC bridge for Electron desktop"
```

---

### Task 3.4: Offline Awareness

**Files:**
- Create: `apps/desktop/renderer/src/hooks/useOnlineStatus.ts`
- Create: `apps/desktop/renderer/src/components/OfflinePlaceholder.tsx`

- [ ] **Step 1: Create useOnlineStatus hook**

```typescript
import { useState, useEffect } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```

- [ ] **Step 2: Create OfflinePlaceholder component**

For maps and other online-only features:

```tsx
import { WifiOff } from 'lucide-react'

interface OfflinePlaceholderProps {
  feature: string
  message?: string
}

export default function OfflinePlaceholder({ feature, message }: OfflinePlaceholderProps) {
  return (
    <div className="flex flex-col items-center justify-center h-64 bg-stone-100 rounded-2xl border-2 border-dashed border-stone-300">
      <WifiOff className="w-12 h-12 text-stone-400 mb-3" />
      <p className="text-stone-600 font-medium">{feature} requires an internet connection</p>
      {message && <p className="text-stone-400 text-sm mt-1">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/hooks/useOnlineStatus.ts apps/desktop/renderer/src/components/OfflinePlaceholder.tsx
git commit -m "feat: add offline awareness hook and placeholder component"
```

---

### Task 3.5: Simplify Inspection Report

**Files:**
- Modify: `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

- [ ] **Step 1: Add reportCompleted toggle**

In the inspection detail section of `InspectionProfile.tsx`, find the area where inspection status is displayed. Add a simple checkbox toggle:

```tsx
{/* Report Status — replaces in-app editor */}
<div className="flex items-center gap-3 mt-4">
  <input
    type="checkbox"
    id="reportCompleted"
    checked={inspection.reportCompleted === true}
    onChange={async () => {
      const updated = { ...inspection, reportCompleted: !inspection.reportCompleted }
      // Save via useDatabase or Firestore
    }}
    className="w-5 h-5 rounded border-stone-300 text-green-600 focus:ring-green-500"
  />
  <label htmlFor="reportCompleted" className="text-sm font-medium text-stone-700">
    Report Completed
  </label>
</div>
```

This replaces any in-app report editor. The status toggle is persisted to the database.

- [ ] **Step 2: Update Firestore inspection rules to allow reportCompleted field**

In `firestore.rules`, the `isValidInspection` function already allows optional fields not in the `hasOnlyAllowedFields` list — but `reportCompleted` needs to be added:

Find `hasOnlyAllowedFields` in `isValidInspection` and add `'reportCompleted'` to the array.

Also add the validation line:
```
(!('reportCompleted' in data) || data.reportCompleted is bool)
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/pages/InspectionProfile.tsx firestore.rules
git commit -m "feat: simplify inspection report to status toggle checkbox"
```

---

## Phase 3 Checkpoint

At this point you should have:
- [x] SQLite database with full schema (all collections mirrored)
- [x] IPC bridge for database CRUD operations
- [x] useDatabase hook with Firestore fallback for browser dev
- [x] Local file storage via Node.js fs
- [x] useFileStorage hook
- [x] Offline awareness (useOnlineStatus + OfflinePlaceholder)
- [x] Inspection report simplified to status toggle

---

## Chunk 4: Phase 4 — Cloud Backup & Sync Engine

### Task 4.1: Sync Engine (Main Process)

**Files:**
- Create: `apps/desktop/main/syncEngine.ts`
- Modify: `apps/desktop/main/index.ts`
- Modify: `apps/desktop/main/preload.ts`

- [ ] **Step 1: Create apps/desktop/main/syncEngine.ts**

```typescript
import { getDatabase } from './database'

type SyncDirection = 'local-to-cloud'
type SyncState = 'idle' | 'syncing' | 'error'

interface SyncConfig {
  firestoreToken: string
  driveToken: string
  userId: string
  projectId: string
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
] as const

let syncInterval: ReturnType<typeof setInterval> | null = null
let syncState: SyncState = 'idle'

export function getSyncState(): SyncState {
  return syncState
}

export function getPendingCount(): number {
  const db = getDatabase()
  let total = 0
  for (const table of TABLES_TO_SYNC) {
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM ${table} WHERE syncStatus = 'pending'`
    ).get() as { count: number }
    total += row.count
  }
  return total
}

export async function syncTable(
  table: string,
  config: SyncConfig,
): Promise<{ synced: number; failed: number }> {
  const db = getDatabase()
  const pending = db.prepare(
    `SELECT * FROM ${table} WHERE syncStatus = 'pending'`
  ).all() as Record<string, unknown>[]

  let synced = 0
  let failed = 0

  // Map table names to Firestore collection paths
  const collectionPath = table === 'operation_documents'
    ? null // handled specially — subcollection
    : table === 'operation_activities'
    ? null // handled specially — subcollection
    : `users/${config.userId}/${table}`

  for (const record of pending) {
    try {
      if (!collectionPath) {
        // Handle subcollections
        const opId = record['operationId'] as string
        const subCollection = table === 'operation_documents' ? 'documents' : 'activities'
        const subPath = `users/${config.userId}/operations/${opId}/${subCollection}`
        await pushToFirestore(subPath, record, config)
      } else {
        await pushToFirestore(collectionPath, record, config)
      }

      // Mark as synced
      db.prepare(
        `UPDATE ${table} SET syncStatus = 'synced' WHERE id = ?`
      ).run(record['id'])

      synced++
    } catch (err) {
      db.prepare(
        `UPDATE ${table} SET syncStatus = 'failed' WHERE id = ?`
      ).run(record['id'])
      failed++
    }
  }

  return { synced, failed }
}

async function pushToFirestore(
  collectionPath: string,
  record: Record<string, unknown>,
  config: SyncConfig,
): Promise<void> {
  const docId = record['id'] as string
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/${collectionPath}/${docId}`

  // Convert record to Firestore document format.
  // SQLite stores booleans as INTEGER (0/1) — must convert to booleanValue.
  // Known boolean fields that are stored as INTEGER in SQLite:
  const BOOLEAN_FIELDS = new Set(['isBundled', 'reportCompleted'])

  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'syncStatus' || key === 'updatedAt') continue
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null }
      continue
    }
    // Handle SQLite INTEGER → Firestore boolean for known boolean fields
    if (BOOLEAN_FIELDS.has(key)) {
      fields[key] = { booleanValue: !!value }
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value }
    } else if (typeof value === 'number') {
      // Use integerValue for whole numbers, doubleValue for decimals
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

export function startSync(config: SyncConfig, intervalMs = 60_000): void {
  if (syncInterval) return

  const runSync = async () => {
    syncState = 'syncing'
    try {
      for (const table of TABLES_TO_SYNC) {
        await syncTable(table, config)
      }
      syncState = 'idle'
    } catch {
      syncState = 'error'
    }
  }

  // Initial sync
  runSync()

  // Periodic sync
  syncInterval = setInterval(runSync, intervalMs)
}

// Pull unassigned_uploads from Firestore into local SQLite.
// Mobile companion creates these records — desktop needs them locally.
export async function pullUnassignedUploads(config: SyncConfig): Promise<number> {
  const url = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/users/${config.userId}/unassigned_uploads`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.firestoreToken}` },
  })
  if (!response.ok) return 0

  const data = await response.json()
  const documents = data.documents ?? []
  const db = getDatabase()
  let pulled = 0

  for (const doc of documents) {
    const docId = doc.name.split('/').pop()
    const existing = db.prepare('SELECT id FROM unassigned_uploads WHERE id = ?').get(docId)
    if (existing) continue // Already have it locally

    const fields = doc.fields ?? {}
    db.prepare(`
      INSERT OR IGNORE INTO unassigned_uploads (id, fileName, fileType, fileUrl, uploadedAt, source, operationId, syncStatus)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
    `).run(
      docId,
      fields.fileName?.stringValue ?? '',
      fields.fileType?.stringValue ?? '',
      fields.fileUrl?.stringValue ?? '',
      fields.uploadedAt?.timestampValue ?? new Date().toISOString(),
      fields.source?.stringValue ?? 'mobile',
      fields.operationId?.stringValue ?? null,
    )
    pulled++
  }
  return pulled
}

export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  syncState = 'idle'
}
```

**Note on dual sync mechanisms:** When running in Electron, this sync engine replaces the old `BackgroundSyncContext` + `syncQueue.ts` (IndexedDB-based queue). In Task 4.1 Step 3 below, the `BackgroundSyncContext` is updated to no-op when `window.electronAPI` is present, preventing duplicate uploads.

- [ ] **Step 2: Disable old BackgroundSyncContext in Electron**

Modify `apps/desktop/renderer/src/contexts/BackgroundSyncContext.tsx`. At the top of the provider component, add an early return for Electron:

```typescript
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.sync

// In the provider component:
if (isElectron) {
  // In Electron, sync is handled by the main process sync engine.
  // Don't start the old IndexedDB-based background sync.
  return (
    <BackgroundSyncContext.Provider value={{ queueSize: 0, isOnline: true, triggerSync: () => {} }}>
      {children}
    </BackgroundSyncContext.Provider>
  )
}
```

- [ ] **Step 3: Add sync IPC handlers to main/index.ts**

```typescript
import { startSync, stopSync, getSyncState, getPendingCount } from './syncEngine'

ipcMain.handle('sync:start', (_event, config) => {
  startSync(config)
  return { success: true }
})

ipcMain.handle('sync:stop', () => {
  stopSync()
  return { success: true }
})

ipcMain.handle('sync:state', () => getSyncState())

ipcMain.handle('sync:pendingCount', () => getPendingCount())
```

- [ ] **Step 3: Expose sync IPC in preload.ts**

Add to the `electronAPI` object:

```typescript
// Sync engine
sync: {
  start: (config: { firestoreToken: string; driveToken: string; userId: string; projectId: string }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('sync:start', config),
  stop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('sync:stop'),
  getState: (): Promise<string> =>
    ipcRenderer.invoke('sync:state'),
  getPendingCount: (): Promise<number> =>
    ipcRenderer.invoke('sync:pendingCount'),
},
```

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/main/syncEngine.ts
git commit -m "feat: add background sync engine with local-to-cloud Firestore push"
```

---

### Task 4.2: Sync Status UI Indicator

**Files:**
- Create: `apps/desktop/renderer/src/components/SyncIndicator.tsx`
- Modify: `apps/desktop/renderer/src/components/Layout.tsx`

- [ ] **Step 1: Create SyncIndicator component**

```tsx
import { useState, useEffect } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.sync

type SyncVisualState = 'synced' | 'pending' | 'error' | 'offline'

export default function SyncIndicator() {
  const [state, setState] = useState<SyncVisualState>('synced')
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isElectron) return

    const check = async () => {
      const online = await window.electronAPI!.isOnline()
      if (!online) {
        setState('offline')
        return
      }

      const syncState = await window.electronAPI!.sync.getState()
      const pending = await window.electronAPI!.sync.getPendingCount()
      setPendingCount(pending)

      if (syncState === 'error') setState('error')
      else if (pending > 0) setState('pending')
      else setState('synced')
    }

    check()
    const interval = setInterval(check, 5000)
    return () => clearInterval(interval)
  }, [])

  if (!isElectron) return null

  const config: Record<SyncVisualState, { color: string; icon: React.ReactNode; label: string }> = {
    synced: { color: 'text-green-500', icon: <Cloud className="w-4 h-4" />, label: 'Synced' },
    pending: { color: 'text-yellow-500', icon: <RefreshCw className="w-4 h-4 animate-spin" />, label: `${pendingCount} pending` },
    error: { color: 'text-red-500', icon: <CloudOff className="w-4 h-4" />, label: 'Sync error' },
    offline: { color: 'text-stone-400', icon: <CloudOff className="w-4 h-4" />, label: 'Offline' },
  }

  const { color, icon, label } = config[state]

  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}
```

- [ ] **Step 2: Add SyncIndicator to Layout sidebar**

In `Layout.tsx`, import and render `SyncIndicator` at the bottom of the sidebar, above the sign-out button.

```tsx
import SyncIndicator from './SyncIndicator'

// In the sidebar JSX, before the sign-out button:
<SyncIndicator />
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/components/SyncIndicator.tsx apps/desktop/renderer/src/components/Layout.tsx
git commit -m "feat: add sync status indicator (green/yellow/red) to sidebar"
```

---

## Phase 4 Checkpoint

At this point you should have:
- [x] Background sync engine in Electron main process
- [x] Local SQLite → Firestore push for all tables
- [x] sync_status tracking (synced/pending/failed per record)
- [x] UI sync indicator in sidebar
- [x] Sync starts when online with auth token

---

## Chunk 5: Phase 5 — Mobile Companion Web App

### Task 5.1: Mobile Login Screen

**Files:**
- Create: `apps/mobile/src/screens/Login.tsx`
- Modify: `apps/mobile/src/App.tsx`

- [ ] **Step 1: Create apps/mobile/src/screens/Login.tsx**

```tsx
import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth'
import { auth } from '@dios/shared'
import { OAUTH_SCOPES } from '@dios/shared'

interface LoginProps {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!auth) {
      setError('Firebase not configured')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const provider = new GoogleAuthProvider()
      for (const scope of OAUTH_SCOPES) {
        provider.addScope(scope)
      }
      const result = await signInWithPopup(auth, provider)
      onLogin(result.user)
    } catch (err) {
      setError('Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-stone-800">DIOS Studio</h1>
        <p className="text-stone-500 mt-2">Mobile Upload Companion</p>
      </div>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full max-w-sm px-6 py-4 bg-stone-800 text-white rounded-2xl font-medium text-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </button>

      {error && (
        <p className="mt-4 text-red-500 text-sm">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/Login.tsx
git commit -m "feat: create mobile login screen with Google OAuth"
```

---

### Task 5.2: Mobile Upload Screen

**Files:**
- Create: `apps/mobile/src/screens/Upload.tsx`

- [ ] **Step 1: Create apps/mobile/src/screens/Upload.tsx**

```tsx
import { useState, useEffect } from 'react'
import { Camera, Upload as UploadIcon, X, Check, ChevronDown } from 'lucide-react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@dios/shared'
import type { Operation } from '@dios/shared'
import type { User } from 'firebase/auth'

interface UploadScreenProps {
  user: User
  onSuccess: () => void
}

type Phase = 'landing' | 'preview' | 'select-operation' | 'uploading' | 'success'

export default function UploadScreen({ user, onSuccess }: UploadScreenProps) {
  const [phase, setPhase] = useState<Phase>('landing')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [operations, setOperations] = useState<Operation[]>([])
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load operations for selector
  useEffect(() => {
    if (!db || !user) return
    getDocs(collection(db, `users/${user.uid}/operations`)).then((snap) => {
      const ops = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Operation)
      setOperations(ops.filter((o) => o.status === 'active'))
    })
  }, [user])

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
    setPhase('preview')
  }

  const handleUpload = async () => {
    if (!file || !db || !storage || !user) return
    setPhase('uploading')
    setError(null)

    try {
      const fileName = `${Date.now()}_${file.name}`
      const storagePath = `users/${user.uid}/uploads/${fileName}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)

      // Create unassigned_uploads record
      await addDoc(collection(db, `users/${user.uid}/unassigned_uploads`), {
        fileName: file.name,
        fileType: file.type,
        fileUrl: downloadUrl,
        uploadedAt: serverTimestamp(),
        source: 'mobile',
        operationId: selectedOp?.id ?? null,
      })

      setPhase('success')

      // Auto-reset after 3 seconds
      setTimeout(() => {
        setFile(null)
        setPreview(null)
        setSelectedOp(null)
        setPhase('landing')
      }, 3000)
    } catch (err) {
      setError('Upload failed. Please try again.')
      setPhase('preview')
    }
  }

  const reset = () => {
    setFile(null)
    setPreview(null)
    setSelectedOp(null)
    setError(null)
    setPhase('landing')
  }

  // Landing: Take Photo or Upload File
  if (phase === 'landing') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6 gap-4">
        <h2 className="text-xl font-bold text-stone-800 mb-4">Upload to DIOS Studio</h2>

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-[#D49A6A] text-white rounded-2xl font-medium text-lg cursor-pointer hover:bg-[#c28a5c] transition-colors">
          <Camera className="w-6 h-6" />
          Take Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />
        </label>

        <label className="w-full max-w-sm flex items-center justify-center gap-3 px-6 py-5 bg-stone-200 text-stone-800 rounded-2xl font-medium text-lg cursor-pointer hover:bg-stone-300 transition-colors">
          <UploadIcon className="w-6 h-6" />
          Upload File
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleCapture}
            className="hidden"
          />
        </label>
      </div>
    )
  }

  // Preview
  if (phase === 'preview') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={reset} className="text-stone-500">
            <X className="w-6 h-6" />
          </button>
          <span className="text-sm text-stone-500">{file?.name}</span>
        </div>

        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-[50vh] object-contain rounded-xl mb-4"
          />
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={() => setPhase('select-operation')}
          className="w-full px-6 py-4 bg-stone-800 text-white rounded-2xl font-medium text-lg mt-auto"
        >
          Select Operation
        </button>
      </div>
    )
  }

  // Select Operation
  if (phase === 'select-operation') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col p-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setPhase('preview')} className="text-stone-500">
            <X className="w-6 h-6" />
          </button>
          <span className="text-sm font-medium text-stone-700">Select Operation</span>
          <div className="w-6" />
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto flex-1 mb-4">
          <button
            onClick={() => {
              setSelectedOp(null)
              handleUpload()
            }}
            className="w-full text-left px-4 py-3 bg-stone-100 rounded-xl text-stone-600 text-sm"
          >
            No operation (unassigned)
          </button>
          {operations.map((op) => (
            <button
              key={op.id}
              onClick={() => {
                setSelectedOp(op)
                handleUpload()
              }}
              className="w-full text-left px-4 py-3 bg-white rounded-xl border border-stone-200 hover:border-[#D49A6A] transition-colors"
            >
              <span className="font-medium text-stone-800">{op.name}</span>
              <span className="text-xs text-stone-500 block mt-0.5">{op.address}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Uploading
  if (phase === 'uploading') {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-stone-300 border-t-[#D49A6A] rounded-full animate-spin mb-4" />
        <p className="text-stone-600 font-medium">Uploading...</p>
      </div>
    )
  }

  // Success
  return (
    <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
        <Check className="w-10 h-10 text-green-600" />
      </div>
      <p className="text-stone-800 font-bold text-xl">Upload Complete</p>
      <p className="text-stone-500 text-sm mt-1">
        {selectedOp ? `Linked to ${selectedOp.name}` : 'Saved as unassigned'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/screens/Upload.tsx
git commit -m "feat: create mobile upload screen with camera capture and operation selector"
```

---

### Task 5.3: Wire Up Mobile App

**Files:**
- Modify: `apps/mobile/src/App.tsx`
- Modify: `apps/mobile/vite.config.ts`
- Create: `apps/mobile/.env.example`

- [ ] **Step 1: Bake Firebase config as build-time env vars**

The mobile app is deployed to Firebase Hosting (different origin than desktop). It cannot read the desktop's `localStorage`. Instead, Firebase config is baked in at build time via Vite environment variables.

Create `apps/mobile/.env.example`:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Create `apps/mobile/.env` (git-ignored) with actual values.

- [ ] **Step 2: Create mobile-specific firebase init**

Create `apps/mobile/src/firebase.ts`:

```typescript
import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'
import { getFirestore, Firestore } from 'firebase/firestore'
import { getStorage, FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const hasConfig = !!firebaseConfig.apiKey

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let storage: FirebaseStorage | null = null

if (hasConfig) {
  const apps = getApps()
  app = apps.find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
  storage = getStorage(app)
}

export { app, db, auth, storage, hasConfig }
```

- [ ] **Step 3: Update apps/mobile/src/App.tsx**

Wire login + upload flow using the build-time Firebase config:

```tsx
import { useState, useEffect } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { auth, hasConfig } from './firebase'
import Login from './screens/Login'
import UploadScreen from './screens/Upload'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  if (!hasConfig) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex flex-col items-center justify-center p-6">
        <p className="text-stone-600 text-center">
          Firebase not configured. Set VITE_FIREBASE_* environment variables and rebuild.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center">
        <p className="text-stone-400">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  return <UploadScreen user={user} onSuccess={() => {}} />
}
```

- [ ] **Step 4: Update mobile Login.tsx to use local firebase**

In `apps/mobile/src/screens/Login.tsx`, change the import:
```typescript
import { auth } from '../firebase'
```
Instead of importing from `@dios/shared`.

- [ ] **Step 5: Update mobile Upload.tsx to use local firebase**

In `apps/mobile/src/screens/Upload.tsx`, change imports:
```typescript
import { db, storage } from '../firebase'
```

- [ ] **Step 6: Verify mobile app builds**

```bash
npm run build -w apps/mobile
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/
git commit -m "feat: wire mobile app with auth flow and upload screen"
```

---

## Phase 5 Checkpoint

At this point you should have:
- [x] Mobile login screen with Google OAuth
- [x] Upload screen: camera capture → preview → operation selector → upload → success
- [x] Files uploaded to Firebase Storage + unassigned_uploads Firestore collection
- [x] Auto-reset after successful upload
- [x] Works on iOS Safari and Android Chrome

---

## Chunk 6: Phase 6 — Fix Known Issues

### Task 6.1: XSS Fix in Email.tsx

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Email.tsx`

- [ ] **Step 1: Add DOMPurify import**

```typescript
import DOMPurify from 'dompurify'
```

- [ ] **Step 2: Replace all dangerouslySetInnerHTML**

Find every instance of `dangerouslySetInnerHTML` in Email.tsx.

Replace the pattern:
```tsx
dangerouslySetInnerHTML={{ __html: someHtml }}
```

With:
```tsx
dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(someHtml) }}
```

There should be 2-3 instances (lines ~450, ~501-503 based on production blockers doc).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/pages/Email.tsx
git commit -m "fix: sanitize email HTML with DOMPurify to prevent XSS"
```

---

### Task 6.2: Fix TypeScript Build Error

**Files:**
- Modify: `apps/desktop/renderer/src/pages/OperationProfile.tsx`

- [ ] **Step 1: Fix onClick handler type mismatch at line 541**

Read OperationProfile.tsx around line 541 to identify the exact type mismatch. The issue is an onClick handler signature. Fix the type to match what the handler actually receives.

Common fix pattern: if the handler takes extra args beyond the click event, wrap it:

```tsx
// Before (type error):
onClick={handleSomeAction}

// After (wrapped):
onClick={() => handleSomeAction(someArg)}
```

Or add proper event type:

```tsx
onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleSomeAction(e)}
```

- [ ] **Step 2: Run type check**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/pages/OperationProfile.tsx
git commit -m "fix: resolve TypeScript error in OperationProfile onClick handler"
```

---

### Task 6.3: Replace All console.log with Logger

**Files:** Multiple (30+ files)

- [ ] **Step 1: Search and replace across the codebase**

Use grep to find all console.log/warn/error statements in `apps/desktop/renderer/src/`:

```bash
grep -rn "console\." apps/desktop/renderer/src/ --include="*.tsx" --include="*.ts"
```

For each file:
1. Add `import { logger } from '@dios/shared'` if not already imported
2. Replace `console.log(...)` → `logger.debug(...)`
3. Replace `console.warn(...)` → `logger.warn(...)`
4. Replace `console.error(...)` → `logger.error(...)`

Files known to have console statements (from exploration):
- Dashboard.tsx (3)
- Email.tsx (1)
- Expenses.tsx (2)
- InspectionProfile.tsx (1)
- Invoices.tsx (2)
- OperationProfile.tsx (2)
- Reports.tsx (1)
- Routing.tsx (1)
- Schedule.tsx (2)
- Sheets.tsx (3)
- ProcessUploadModal.tsx (3)
- ReceiptScanner.tsx (2)
- SetupWizard.tsx (1)
- syncQueue.ts (8+)
- driveSync.ts (1+)
- localFsSync.ts (2+)
- geocodingUtils.ts (3)
- firestoreErrorHandler.ts (1)

- [ ] **Step 2: Verify no console.log remains**

```bash
grep -rn "console\.\(log\|warn\|error\)" apps/desktop/renderer/src/ --include="*.tsx" --include="*.ts" | wc -l
```

Expected: 0

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/
git commit -m "refactor: replace all console.log statements with configurable logger"
```

---

### Task 6.4: Add Error Boundaries

**Files:**
- Create: `apps/desktop/renderer/src/components/ErrorBoundary.tsx`
- Modify: `apps/desktop/renderer/src/App.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

```tsx
import { Component, ErrorInfo, ReactNode } from 'react'
import { logger } from '@dios/shared'
import { RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('React error boundary caught:', error, errorInfo.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center h-64 text-center p-6">
          <p className="text-stone-700 font-medium mb-2">Something went wrong</p>
          <p className="text-stone-400 text-sm mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-stone-200 text-stone-700 rounded-xl text-sm hover:bg-stone-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

- [ ] **Step 2: Wrap routes in ErrorBoundary in App.tsx**

In `App.tsx`, wrap the `<Suspense>` block inside an `<ErrorBoundary>`:

```tsx
import ErrorBoundary from './components/ErrorBoundary'

// In the JSX:
<ErrorBoundary>
  <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* ... routes ... */}
    </Routes>
  </Suspense>
</ErrorBoundary>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/components/ErrorBoundary.tsx apps/desktop/renderer/src/App.tsx
git commit -m "feat: add React error boundaries for graceful error handling"
```

---

### Task 6.5: Fix Firestore Rules

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add rules for notes and unassigned_uploads**

After the `expenses` match block in `firestore.rules`, add:

```
match /notes/{noteId} {
  allow read: if isOwner(userId);
  allow create, update: if isOwner(userId);
  allow delete: if isOwner(userId);
}

match /unassigned_uploads/{uploadId} {
  allow read: if isOwner(userId);
  allow create: if isOwner(userId);
  allow update: if isOwner(userId);
  allow delete: if isOwner(userId);
}
```

- [ ] **Step 2: Fix isValidInspection — add missing fields**

In `firestore.rules`, find the `isValidInspection` function. Add `'reportCompleted'` and `'googleCalendarEventId'` to the `hasOnlyAllowedFields` array. These fields are already used by `Schedule.tsx` and the new inspection report toggle but are missing from the rules — writes including them will be rejected.

Add to the `hasOnlyAllowedFields` list:
```
'reportCompleted', 'googleCalendarEventId'
```

Add validation lines:
```
(!('reportCompleted' in data) || data.reportCompleted is bool) &&
(!('googleCalendarEventId' in data) || (data.googleCalendarEventId is string && data.googleCalendarEventId.size() < 200))
```

- [ ] **Step 3: Fix isValidExpense — add missing fields**

In `firestore.rules`, find the `isValidExpense` function. Add `'receiptFileId'`, `'inspectionId'`, and `'category'` to the `hasOnlyAllowedFields` array. These fields are used by `ProcessUploadModal.tsx` and `InspectionProfile.tsx` but are missing from the rules.

Add to the `hasOnlyAllowedFields` list:
```
'receiptFileId', 'inspectionId', 'category'
```

Add validation lines:
```
(!('receiptFileId' in data) || (data.receiptFileId is string && data.receiptFileId.size() < 200)) &&
(!('inspectionId' in data) || (data.inspectionId is string && data.inspectionId.size() < 100)) &&
(!('category' in data) || (data.category is string && data.category.size() < 100))
```

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "fix: add Firestore rules for notes, unassigned_uploads, and missing inspection/expense fields"
```

---

### Task 6.6: Package.json Cleanup

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Verify package name and version**

Root `package.json` should already be `"name": "dios-studio"`, `"version": "1.0.0"` from Task 1.1.

Verify `apps/desktop/package.json` has `"name": "@dios/desktop"`.

- [ ] **Step 2: Remove @google/genai**

Ensure `@google/genai` is NOT in any package.json across the workspace.

- [ ] **Step 3: Run npm audit fix**

```bash
npm audit fix
```

If `serialize-javascript` vulnerability persists (via `vite-plugin-pwa`), note that we removed `vite-plugin-pwa` from the desktop app in Task 1.3. Verify it's gone from all package.json files.

- [ ] **Step 4: Commit**

```bash
git add package.json apps/desktop/package.json
git commit -m "chore: clean up dependencies, remove unused packages, fix versions"
```

---

### Task 6.7: Fix Deprecated Firebase API

This was already handled in Task 1.2, Step 8 (packages/shared/src/firebase.ts). Verify that the old `enableIndexedDbPersistence` call is gone and replaced with `persistentLocalCache`.

- [ ] **Step 1: Verify no deprecated API usage**

```bash
grep -rn "enableIndexedDbPersistence" apps/ packages/
```

Expected: 0 results.

---

## Phase 6 Checkpoint

At this point you should have:
- [x] XSS fixed with DOMPurify in Email.tsx
- [x] TypeScript build error fixed in OperationProfile.tsx
- [x] All console.log replaced with configurable logger
- [x] Error boundaries wrapping all routes
- [x] Firestore rules for notes and unassigned_uploads
- [x] Package.json cleaned up (name, version, deps)
- [x] Deprecated Firebase API replaced
- [x] npm audit vulnerabilities resolved

---

## Final Verification

- [ ] `npm run lint` passes (both desktop and shared)
- [ ] `npm run build` succeeds (desktop + shared)
- [ ] `npm run build:mobile` succeeds
- [ ] `npm run dev` starts desktop on port 3000
- [ ] `npm run dev:mobile` starts mobile on port 3001
- [ ] Desktop app routes load lazily (check Network tab)
- [ ] No console.log statements remain in source
- [ ] No TypeScript errors
- [ ] All Firestore rules cover all collections used by the app
