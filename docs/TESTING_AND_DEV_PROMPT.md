# Testing & Dev Server Setup Prompt

Copy this entire prompt into a new Claude Code chat in the `/home/chrishoran/Desktop/DIOS` directory.

---

## Task: Set up Vitest testing infrastructure and achieve 100% test coverage, then build and run the dev server

You are working on DIOS Studio, an Electron + React monorepo at `/home/chrishoran/Desktop/DIOS`. Branch: `feat/feature-parity`. The project has **zero test infrastructure** currently — no test runner, no test files, no coverage tools.

### Phase 1: Install Vitest + Testing Dependencies

Install in the root `package.json` (workspace-level dev dependencies):

```
vitest @vitest/coverage-v8 @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom happy-dom
```

Create `vitest.config.ts` at project root configured for:
- `environment: 'jsdom'`
- `globals: true`
- `setupFiles` pointing to a test setup file
- `include: ['apps/desktop/renderer/src/**/*.test.{ts,tsx}', 'packages/shared/src/**/*.test.ts']`
- Coverage thresholds at 80% (lines, branches, functions, statements)
- Coverage provider: `v8`
- Alias `@/*` → `apps/desktop/renderer/src/*` and `@dios/shared` → `packages/shared/src`

Create a `tests/setup.ts` file that imports `@testing-library/jest-dom`.

Add scripts to root `package.json`:
- `"test": "vitest run"`
- `"test:watch": "vitest"`
- `"test:coverage": "vitest run --coverage"`

### Phase 2: Mock Strategy

Many modules depend on Firebase, Google APIs, Electron IPC, and browser APIs. Create mock files:

**`tests/mocks/firebase.ts`** — Mock `@dios/shared/firebase`:
```typescript
export const db = {} // mock Firestore
export const storage = {} // mock Firebase Storage
export const auth = {} // mock Firebase Auth
```

**`tests/mocks/shared.ts`** — Mock `@dios/shared`:
```typescript
export const configStore = {
  getConfig: () => ({ googleMapsApiKey: 'test-key', firebaseConfig: {} }),
  hasConfig: () => true,
  clearConfig: () => {},
}
export const logger = { error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
export const googleApiJson = vi.fn()
```

**`tests/mocks/firestore.ts`** — Mock `firebase/firestore` functions:
```typescript
export const collection = vi.fn()
export const doc = vi.fn(() => ({ id: 'mock-id' }))
export const setDoc = vi.fn()
export const getDoc = vi.fn()
export const getDocs = vi.fn(() => ({ docs: [], forEach: vi.fn() }))
export const onSnapshot = vi.fn(() => vi.fn()) // returns unsubscribe
export const updateDoc = vi.fn()
export const deleteDoc = vi.fn()
export const query = vi.fn()
export const where = vi.fn()
export const orderBy = vi.fn()
```

**`tests/mocks/router.ts`** — Mock `react-router`:
```typescript
export const useParams = vi.fn(() => ({ id: 'test-id' }))
export const useNavigate = vi.fn(() => vi.fn())
export const Link = ({ children, to }: any) => <a href={to}>{children}</a>
export const Navigate = () => null
```

Configure these in `vitest.config.ts` using `resolve.alias` or `vi.mock()` in setup.

### Phase 3: Write Tests — Pure Utility Functions (no mocking needed)

Start with files that have **zero external dependencies** — pure logic:

1. **`apps/desktop/renderer/src/utils/invoiceCalculator.ts`** — Test all 3 exported functions:
   - `resolveRates(agency, operationType)` — default rates, per-type override, invalid JSON fallback
   - `roundToNearestHalfHour(minutes)` — 0, 15, 30, 45, 60, 90, 120 minutes
   - `calculateInvoiceLineItems(inspection, agency, operation, linkedExpenseTotal)` — flat rate, hourly, bundled trip, mileage, per diem, custom line items, default line items, edge cases (zero hours, no mileage)

2. **`apps/desktop/renderer/src/utils/templateRenderer.ts`** — Test `renderTemplate()`:
   - Single variable substitution
   - Multiple variables
   - Missing variables (left as `{variableName}`)
   - Empty template
   - Repeated variable

3. **`apps/desktop/renderer/src/utils/distanceUtils.ts`** — Test the formatters (skip `calculateDistance` which calls Google API):
   - `formatDistance(miles)` — 0, 12.3, 100.456
   - `formatDriveTime(minutes)` — 0, 30, 60, 90, 150

4. **`apps/desktop/renderer/src/lib/pdfGenerator.ts`** — Test `generateInvoicePdf()` and `generateTaxReportPdf()`:
   - Returns a Blob
   - Handles empty line items
   - Handles notes / no notes
   - Tax report with/without mileage data

5. **`packages/shared/src/types.ts`** — Type-level tests (just import and verify type compatibility, no runtime tests needed)

### Phase 4: Write Tests — Components (with mocks)

Test each component renders without crashing and handles its props correctly. Use `@testing-library/react` with `render()` and `screen`.

**Pure display components (no Firebase, no routing):**

6. **InspectionProgressBar** — render with each status, verify correct steps highlighted, click handler fires
7. **StepModal** — render open/closed, checklist interaction, hours input, complete button disabled/enabled
8. **ChecklistEditor** — enabled/disabled toggle, add/remove/reorder items
9. **RateConfigSection** — flat rate toggle, conditional field visibility, onChange callbacks
10. **SignatureEditor** — renders editor and preview, onChange fires
11. **NearbyOperatorsModal** — renders list sorted by distance, handles no-location case
12. **StickyNote** — mode toggle (note/task), submit disabled when empty (mock Firebase for save)
13. **UnifiedActivityFeed** — loading state, empty state, renders entries (mock Firebase listeners)
14. **InvoiceEditor** — renders line items, add/remove items, total calculation, save/print/email buttons
15. **InvoiceEmailModal** — renders pre-filled fields, template variable substitution
16. **OnboardingWizard** — step navigation, skip button, back button, form inputs

**Page components (mock Firebase + Router):**

17. **Settings** — tab rendering, tab switching, agency list from mock data
18. **Invoices** — filter buttons, status display, mark paid
19. **Reports** — year selector, mileage summary card, chart placeholder

### Phase 5: Write Tests — Schema & Database (Node environment)

20. **`apps/desktop/main/schema.ts`** — Test `migrateSchema()`:
    - Mock a better-sqlite3 database, verify ALTER TABLE calls
    - Test `safeAddColumn` ignores duplicate column errors

21. **`apps/desktop/main/syncEngine.ts`** — Test `BOOLEAN_FIELDS` set contains all expected fields

### Phase 6: Run and Verify

After writing all tests:

```bash
npm run test:coverage
```

Target: **100% coverage** on:
- `utils/invoiceCalculator.ts`
- `utils/templateRenderer.ts`
- `utils/distanceUtils.ts` (formatters only — skip Google API call)
- All new components from the feature parity work

Target: **80%+ coverage** overall across the project.

Fix any failing tests. Iterate until green.

### Phase 7: Build and Run Dev Server

After tests pass:

```bash
# Build the shared package first
npm run build -w packages/shared

# Start the desktop dev server
npm run dev
```

This starts Vite on port 3000. Open `http://localhost:3000` in a browser.

**Verify visually:**
1. Login page loads
2. After auth (or dummy mode): OnboardingWizard appears on first launch
3. Settings page has tabbed layout (My Business / agencies / Data & Integrations)
4. Operation Profile shows 6-step progress bar, year selector, distance, nearby button
5. Invoice flow: Report step → View Invoice → editable line items → Download PDF / Email
6. Reports page: mileage summary card, 2026+ year selector, cash-basis chart
7. All pages render without console errors

Report any layout issues, broken imports, or runtime errors you find.

### File Reference

**Utilities to test (pure functions, highest priority):**
- `apps/desktop/renderer/src/utils/invoiceCalculator.ts`
- `apps/desktop/renderer/src/utils/templateRenderer.ts`
- `apps/desktop/renderer/src/utils/distanceUtils.ts`

**Components to test (new from feature parity):**
- `apps/desktop/renderer/src/components/InspectionProgressBar.tsx`
- `apps/desktop/renderer/src/components/StepModal.tsx`
- `apps/desktop/renderer/src/components/ChecklistEditor.tsx`
- `apps/desktop/renderer/src/components/RateConfigSection.tsx`
- `apps/desktop/renderer/src/components/SignatureEditor.tsx`
- `apps/desktop/renderer/src/components/NearbyOperatorsModal.tsx`
- `apps/desktop/renderer/src/components/StickyNote.tsx`
- `apps/desktop/renderer/src/components/UnifiedActivityFeed.tsx`
- `apps/desktop/renderer/src/components/InvoiceEditor.tsx`
- `apps/desktop/renderer/src/components/InvoiceEmailModal.tsx`
- `apps/desktop/renderer/src/components/OnboardingWizard.tsx`
- `apps/desktop/renderer/src/components/BusinessProfileTab.tsx`
- `apps/desktop/renderer/src/components/AgencySettingsTab.tsx`

**Pages to test:**
- `apps/desktop/renderer/src/pages/Settings.tsx`
- `apps/desktop/renderer/src/pages/Invoices.tsx`
- `apps/desktop/renderer/src/pages/Reports.tsx`
- `apps/desktop/renderer/src/pages/OperationProfile.tsx`
- `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

**Backend to test:**
- `apps/desktop/main/schema.ts`
- `apps/desktop/main/syncEngine.ts`
- `apps/desktop/renderer/src/lib/pdfGenerator.ts`

**Shared types:**
- `packages/shared/src/types.ts`
