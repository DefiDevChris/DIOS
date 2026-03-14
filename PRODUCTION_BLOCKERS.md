# DIOS Studio — Production Blockers

Comprehensive audit as of 2026-03-14. Issues are ranked by severity.

---

## CRITICAL (Must fix before deploy)

### 1. XSS Vulnerability in Email.tsx
**File:** `src/pages/Email.tsx` (lines 450, 501-502)
**Issue:** Raw Gmail HTML rendered via `dangerouslySetInnerHTML`. The sanitizer only strips `<script>` tags — `onerror`, `onload`, `javascript:` URIs, `<iframe>`, `<object>`, and inline event handlers remain exploitable.
**Fix:** Use DOMPurify (already in `node_modules`) to sanitize all HTML before rendering. Replace the regex-based strip with `DOMPurify.sanitize(html)`.

### 2. No Tests — Zero Coverage
**Issue:** No test files exist anywhere in the project (no `.test.*`, no `.spec.*`, no test framework configured).
**Impact:** No regression safety net for any feature. Billing calculations, PDF generation, sync queue logic, and auth flows are all untested.
**Fix:** Add Vitest + React Testing Library. Prioritize tests for:
- `pdfGenerator.ts` (billing math)
- `syncQueue.ts` (queue state machine)
- `AuthContext.tsx` (token lifecycle)
- Firestore rules (Firebase emulator suite)

### 3. TypeScript Build Error
**File:** `src/pages/OperationProfile.tsx` (line 541)
**Issue:** `tsc --noEmit` fails — `onClick` handler has incompatible signature (`(operatorEmail?: string) => Promise<void>` assigned to `MouseEventHandler`).
**Impact:** CI lint/type-check will fail. The function works at runtime but the type contract is broken.
**Fix:** Wrap the call: `onClick={() => handleSyncToCalendar()}`.

### 4. High-Severity npm Vulnerability (RCE)
**Package:** `serialize-javascript <=7.0.2` (via `vite-plugin-pwa → workbox-build → @rollup/plugin-terser`)
**Advisory:** [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq) — Remote Code Execution via `RegExp.flags` / `Date.prototype.toISOString()`.
**Fix:** `npm audit fix --force` (upgrades `vite-plugin-pwa` to 0.19.x — test for breaking changes).

### 5. OAuth Token Stored in localStorage
**File:** `src/contexts/AuthContext.tsx` (lines 60-62)
**Issue:** Google OAuth access token and expiry stored in `localStorage`. Any XSS vector (including the Email.tsx issue above) could exfiltrate the token, granting full Drive/Gmail/Calendar access.
**Mitigation:** Fix all XSS vectors first. Consider moving token to an in-memory-only store or HttpOnly cookie via a backend proxy. At minimum, add Content-Security-Policy headers.

### 6. Sensitive Data Logged to Console
**File:** `src/utils/firestoreErrorHandler.ts` (line 45)
**Issue:** `console.error` outputs `userId`, `email`, and `tenantId` in JSON. In production, browser console logs may be captured by monitoring tools or exposed in error reports.
**Fix:** Strip PII from console output. Log only to a secure, server-side logging service.

---

## HIGH (Should fix before deploy)

### 7. No Content-Security-Policy Headers
**Issue:** No CSP configured anywhere. The app loads scripts from Google CDNs, unpkg, jsdelivr, and Tesseract WASM. Without CSP, any injected script runs unrestricted.
**Fix:** Add CSP meta tag or HTTP headers. Whitelist only required origins.

### 8. No Rate Limiting or Abuse Protection
**Issue:** All Firestore writes and Google API calls are triggered directly from the client with no throttling. A malicious or buggy client could exhaust quotas or generate excessive Firestore writes.
**Fix:** Add Firestore rate-limiting rules, implement client-side debouncing on write-heavy operations, and consider Cloud Functions for sensitive operations.

### 9. 2.8 MB Main Bundle (No Code Splitting)
**File:** `dist/assets/index-C8Fg4DgX.js` — 2,866 KB uncompressed (736 KB gzipped)
**Issue:** All 17 pages, Recharts, React Big Calendar, Tesseract.js, Google Maps, Motion, SweetAlert2, PapaParse, and jsPDF are bundled into a single chunk.
**Impact:** First load is ~800 KB+ gzipped. Mobile users on slow connections will experience 5-10 second load times.
**Fix:** Add `React.lazy()` + `Suspense` for route-level code splitting. Move heavy libraries (Tesseract, Recharts, jsPDF, html2canvas) to dynamic imports.

### 10. No Error Boundaries
**Issue:** No React error boundaries anywhere in the component tree. A rendering error in any page crashes the entire app with a white screen.
**Fix:** Add `<ErrorBoundary>` wrappers at the Layout level and per-page level.

### 11. Missing `noopener noreferrer` and Link Security
**Issue:** External links and window.open calls throughout the app don't consistently use `rel="noopener noreferrer"` or validate URLs.

### 12. Deprecated Firestore API Usage
**File:** `src/firebase.ts` (line 36)
**Issue:** `enableIndexedDbPersistence()` is deprecated in Firebase SDK v10+. The recommended replacement is `enablePersistentCacheIndexManager()` or the `persistentLocalCache` option on `initializeFirestore()`.
**Fix:** Migrate to `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`.

### 13. Firestore Rules — Missing Collections
**Issue:** The app writes to `notes` and `unassigned_uploads` collections (see Dashboard.tsx, ProcessUploadModal.tsx), but `firestore.rules` has no rules for these collections. Writes will be **denied** by default.
**Fix:** Add rules for `notes` and `unassigned_uploads` under the user path.

### 14. Package Name is `react-example`
**File:** `package.json` (line 2)
**Issue:** Package name is a placeholder (`react-example`), version is `0.0.0`. This affects PWA identification, error reporting, and professionalism.
**Fix:** Change to `"name": "dios-studio"`, set a real version.

---

## MEDIUM (Should fix soon after deploy)

### 15. 30+ console.log/warn/error Statements
**Files:** Across 15+ source files
**Issue:** Debug logging left throughout production code. These leak internal state to anyone opening DevTools.
**Locations (partial):**
- `syncQueue.ts` (8 instances)
- `OperationProfile.tsx` (2 instances)
- `Dashboard.tsx` (3 instances)
- `Operations.tsx` (2 instances)
- `Schedule.tsx` (3 instances)
- `Email.tsx` (2 instances)
- `Settings.tsx` (3 instances)
- `ReceiptScanner.tsx` (2 instances)
- `ProcessUploadModal.tsx` (3 instances)
- `localFsSync.ts` (4 instances)
- `geocodingUtils.ts` (3 instances)
**Fix:** Replace with a configurable logger that is silent in production. Strip `console.*` calls via a Vite plugin or ESLint rule.

### 16. Two Files Exceed 800 Lines
- `OperationProfile.tsx` — 922 lines (combines operation details, Gmail CRM, file uploads, scheduling)
- `InspectionProfile.tsx` — 899 lines (combines inspection data, billing, expenses, invoicing)
**Fix:** Extract sub-components: `OperationGmailCRM`, `OperationDocuments`, `InspectionBilling`, `InspectionExpenses`.

### 17. Multiple `as any` Type Casts
**Files:**
- `driveSync.ts:38` — `gapi.client.drive as any`
- `localFsSync.ts:35` — `handle as any`
- `Layout.tsx:38,151` — `icon: any`
- `SetupWizard.tsx:52` — `(e: any)`
- `AuthContext.tsx:277` — `(value as any)._getValidToken`
**Fix:** Create proper type definitions for Google API clients and component props.

### 18. Silent Error Swallowing
**Files:**
- `Layout.tsx:74,136-137` — Empty catch blocks
- `geocodingUtils.ts:29,55,83` — Errors logged but never surfaced to user
- `Email.tsx:145-148` — API failures with no user feedback
- `NotesTasks.tsx:159` — Catch without type annotation
**Fix:** Show user-facing error toasts. At minimum, re-throw or track errors.

### 19. No Input Sanitization on File Names
**Files:** `syncQueue.ts`, `driveSync.ts`, `ProcessUploadModal.tsx`
**Issue:** File names from user uploads are passed directly to Google Drive API and local file system without sanitization. Malicious file names could cause path traversal or API errors.
**Fix:** Sanitize file names (strip `../`, control characters, limit length).

### 20. Missing Accessibility (a11y)
- No `aria-label` on icon-only buttons throughout the app
- `MobileHub.tsx:123-126` — Image previews missing `alt` text
- `Email.tsx:450` — `dangerouslySetInnerHTML` content has no accessibility fallback
- No skip-to-content link
- No keyboard navigation testing
**Fix:** Audit with `axe-core` or `eslint-plugin-jsx-a11y`.

### 21. No Environment Variable Validation
**Issue:** The app loads Firebase config from `localStorage` at runtime with no schema validation. Malformed or partial config will cause cryptic runtime errors.
**Fix:** Validate config shape with Zod before `initializeFirebase()`.

### 22. Race Conditions in Snapshot Listeners
**Files:**
- `OperationProfile.tsx:89-177` — Multiple `onSnapshot()` subscriptions; cleanup may race on navigation
- `Schedule.tsx:109-115` — Closure over `unsub` in async function
**Fix:** Use AbortController pattern or ensure all unsubscribe functions are called synchronously in cleanup.

### 23. No Timeout on Promise.all Operations
**File:** `Email.tsx:106-133`
**Issue:** `Promise.all()` fetches thread details from Gmail API with no timeout. If the API hangs, the UI freezes indefinitely.
**Fix:** Add `Promise.race()` with a timeout, or use `AbortController` on fetch calls.

### 24. `@google/genai` Included but Unused
**File:** `package.json` (line 14)
**Issue:** `@google/genai` is a dependency adding to bundle size but is not imported anywhere in the source.
**Fix:** Remove from `package.json` if not planned for immediate use.

### 25. Dev Dependencies Mixed with Production
**File:** `package.json`
**Issue:** `@types/*` packages, `dotenv`, `express`, and `tsx` are in `dependencies` instead of `devDependencies`. This inflates production `node_modules` if deployed with `npm install --production`.
**Fix:** Move type definitions and dev-only packages to `devDependencies`.

---

## LOW (Nice to have)

### 26. No `.env.example` File
**Issue:** No documentation of required environment variables. New developers must read source code to discover configuration needs.

### 27. No CI/CD Pipeline
**Issue:** No GitHub Actions, no pre-commit hooks, no automated testing, linting, or deployment.

### 28. No Favicon for Non-SVG Contexts
**Issue:** Only an SVG icon exists. Some browsers and contexts (bookmarks, older mobile browsers) need PNG favicons in multiple sizes.

### 29. localStorage Not Cleared on Sign-Out for All Keys
**File:** `AuthContext.tsx:244-246`
**Issue:** Sign-out only clears token keys. `dois_studio_config` and IndexedDB data persist, which could leak info if the device is shared.

### 30. Polling for GIS SDK Readiness
**File:** `AuthContext.tsx:119-127`
**Issue:** Uses `setInterval(500ms)` to poll for the Google Identity Services SDK. A `load` event listener on the script tag would be cleaner and more reliable.

---

## Summary

| Severity | Count | Key Themes |
|----------|-------|-----------|
| CRITICAL | 6 | XSS, zero tests, build error, RCE vuln, token storage, PII logging |
| HIGH | 8 | No CSP, no rate limiting, huge bundle, no error boundaries, missing Firestore rules |
| MEDIUM | 11 | Console logs, large files, type safety, silent errors, no a11y |
| LOW | 5 | DX improvements, CI/CD, minor cleanup |
| **Total** | **30** | |
