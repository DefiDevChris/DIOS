# Legacy Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all missing features from the legacy A11 Google Apps Script app into the new DIOS Studio React/Electron app.

**Architecture:** Each task is a self-contained feature addition following existing codebase patterns — Firestore real-time listeners via `onSnapshot`, `@dios/shared` types, Tailwind stone/brown theme (#D49A6A accent), lucide-react icons, SweetAlert2 notifications. All data lives under `users/{uid}/{collection}/` in Firestore.

**Tech Stack:** React 18, TypeScript, Firestore, Tailwind CSS, lucide-react, SweetAlert2, jsPDF, Papa Parse, react-big-calendar, @react-google-maps/api

---

## File Structure Overview

### New Files
| File | Responsibility |
|------|---------------|
| `apps/desktop/renderer/src/pages/Notes.tsx` | Full Notes/Tasks/Prep-Checklist CRUD page |
| `apps/desktop/renderer/src/utils/invoiceNumbering.ts` | Sequential invoice number generator |
| `apps/desktop/renderer/src/utils/csvExport.ts` | Generic CSV export utility |
| `apps/desktop/renderer/src/utils/placesAutocomplete.ts` | Google Places Autocomplete wrapper |
| `apps/desktop/renderer/src/components/AddressAutocomplete.tsx` | Reusable address input with autocomplete |
| `apps/desktop/renderer/src/components/QuickLinksSection.tsx` | Configurable quick links widget for Settings |

### Modified Files
| File | Changes |
|------|---------|
| `packages/shared/src/types.ts` | Add `county` to Inspection/Operation, `paymentMethod` + `invoiceNumber` to Invoice, expand `Note` type, add `scope` union type |
| `packages/shared/src/constants.ts` | Add scope variants, payment methods, default checklists, county list |
| `apps/desktop/renderer/src/App.tsx` | Add `/notes` lazy route |
| `apps/desktop/renderer/src/components/Layout.tsx` | Add Notes nav item, Quick Links section |
| `apps/desktop/renderer/src/pages/InspectionProfile.tsx` | Scope dropdown (not textarea), county field, calendar sync on create |
| `apps/desktop/renderer/src/pages/Invoices.tsx` | Payment method column, date paid display, CSV export button, row status coloring |
| `apps/desktop/renderer/src/pages/Inspections.tsx` | Row status coloring (paid=green, cancelled=grey) |
| `apps/desktop/renderer/src/pages/Operations.tsx` | County field, AddressAutocomplete integration |
| `apps/desktop/renderer/src/pages/Schedule.tsx` | Calendar event color-coding by status |
| `apps/desktop/renderer/src/pages/Settings.tsx` | Quick Links section, backup/export section |
| `apps/desktop/renderer/src/components/OnboardingWizard.tsx` | AddressAutocomplete, default checklist items |
| `apps/desktop/renderer/src/components/SetupWizard.tsx` | AddressAutocomplete |
| `apps/desktop/renderer/src/components/AgencySettingsTab.tsx` | Scope-based rate variant UI, default prep/report checklist items |
| `apps/desktop/renderer/src/lib/pdfGenerator.ts` | Invoice number in PDF, auto-save PDF to Drive |
| `apps/desktop/renderer/src/lib/driveSync.ts` | Auto-create operation folders |
| `apps/desktop/renderer/src/utils/invoiceCalculator.ts` | MIE tier pricing support |

---

## Chunk 1: Type System & Constants Expansion

### Task 1: Expand Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add scope union type and update Inspection interface**

In `types.ts`, add scope type and fields to Inspection:

```typescript
export type InspectionScope =
  | 'Crop'
  | 'Handler'
  | 'Short'
  | 'Unannounced Crop'
  | 'Unannounced Handler';

// In Inspection interface, change:
//   scope is already optional string — keep it but UI will use dropdown
// Add county:
//   county?: string;
```

In the `Inspection` interface, add after `status`:
```typescript
  scope?: InspectionScope | string;
  county?: string;
```

- [ ] **Step 2: Update Invoice interface with paymentMethod and invoiceNumber**

In `types.ts`, add to `Invoice` interface:
```typescript
  invoiceNumber?: string;
  paymentMethod?: 'Check' | 'ACH' | 'Zelle' | 'Venmo' | 'PayPal' | 'Cash' | 'Other' | '';
```

Note: `paidDate` already exists on `Invoice`. Keep it.

- [ ] **Step 3: Expand Note interface**

Replace the existing `Note` interface:
```typescript
export interface Note {
  id: string;
  content: string;
  type: 'Note' | 'Todo' | 'PrepChecklist';
  operationId?: string;
  inspectionId?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Add Operation county field**

In `Operation` interface, add:
```typescript
  county?: string;
```

- [ ] **Step 5: Add constants for scopes, payment methods, and default checklists**

In `constants.ts`, add:
```typescript
export const INSPECTION_SCOPES: string[] = [
  'Crop',
  'Handler',
  'Short',
  'Unannounced Crop',
  'Unannounced Handler',
] as const;

export const PAYMENT_METHODS = [
  'Check',
  'ACH',
  'Zelle',
  'Venmo',
  'PayPal',
  'Cash',
  'Other',
] as const;

export const DEFAULT_PREP_CHECKLIST_ITEMS: string[] = [
  'Review previous inspection report',
  'Check organic system plan updates',
  'Verify input materials',
  'Review complaint history',
  'Prepare inspection forms',
  'Confirm appointment',
  'Map route',
  'Charge device',
];

export const DEFAULT_REPORT_CHECKLIST_ITEMS: string[] = [
  'Review organic system plan',
  'Verify buffer zones',
  'Check input materials',
  'Inspect storage areas',
  'Review records & documentation',
  'Photograph key areas',
  'Complete field observations',
  'Verify pest management plan',
  'Check water sources',
  'Sign off with operator',
];
```

- [ ] **Step 6: Re-export new types from index.ts**

Add to `packages/shared/src/index.ts`:
```typescript
// Already re-exports all types, but ensure InspectionScope is accessible
```

- [ ] **Step 7: Verify build**

Run: `cd /home/chrishoran/Desktop/DIOS && npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 || true`
Expected: No errors on shared package

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/constants.ts
git commit -m "feat: expand shared types with scope variants, payment methods, county, and default checklists"
```

---

## Chunk 2: Invoice Numbering & CSV Export Utilities

### Task 2: Invoice Numbering System

**Files:**
- Create: `apps/desktop/renderer/src/utils/invoiceNumbering.ts`
- Test: `apps/desktop/renderer/src/utils/invoiceNumbering.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { generateInvoiceNumber, getNextInvoiceCounter } from './invoiceNumbering';

describe('invoiceNumbering', () => {
  it('generates INV-YYYY-0001 format for first invoice of the year', () => {
    const result = generateInvoiceNumber(2026, 0);
    expect(result).toBe('INV-2026-0001');
  });

  it('increments counter correctly', () => {
    const result = generateInvoiceNumber(2026, 42);
    expect(result).toBe('INV-2026-0043');
  });

  it('pads number to 4 digits', () => {
    const result = generateInvoiceNumber(2026, 9);
    expect(result).toBe('INV-2026-0010');
  });

  it('handles large numbers beyond 4 digits', () => {
    const result = generateInvoiceNumber(2026, 9999);
    expect(result).toBe('INV-2026-10000');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/utils/invoiceNumbering.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
/**
 * Generates a sequential invoice number in format INV-YYYY-NNNN.
 * @param year - The invoice year
 * @param currentCount - The current count of invoices for that year (0-based)
 * @returns Formatted invoice number string
 */
export function generateInvoiceNumber(year: number, currentCount: number): string {
  const nextNumber = currentCount + 1;
  const padded = nextNumber.toString().padStart(4, '0');
  return `INV-${year}-${padded}`;
}

/**
 * Gets the next invoice number by counting existing invoices for the year.
 * Call this with the count of invoices that have invoiceNumber starting with INV-YYYY-.
 */
export function getNextInvoiceNumber(year: number, existingCount: number): string {
  return generateInvoiceNumber(year, existingCount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/utils/invoiceNumbering.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/utils/invoiceNumbering.ts apps/desktop/renderer/src/utils/invoiceNumbering.test.ts
git commit -m "feat: add sequential invoice numbering utility"
```

### Task 3: CSV Export Utility

**Files:**
- Create: `apps/desktop/renderer/src/utils/csvExport.ts`
- Test: `apps/desktop/renderer/src/utils/csvExport.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { generateCsv, downloadCsv } from './csvExport';

describe('csvExport', () => {
  it('generates CSV string with headers', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const result = generateCsv(data, ['name', 'age']);
    expect(result).toBe('name,age\nAlice,30\nBob,25');
  });

  it('handles empty data', () => {
    const result = generateCsv([], ['name', 'age']);
    expect(result).toBe('name,age');
  });

  it('escapes commas and quotes in values', () => {
    const data = [{ name: 'Smith, John', note: 'He said "hello"' }];
    const result = generateCsv(data, ['name', 'note']);
    expect(result).toBe('name,note\n"Smith, John","He said ""hello"""');
  });

  it('supports custom column labels', () => {
    const data = [{ firstName: 'Alice' }];
    const result = generateCsv(data, ['firstName'], { firstName: 'First Name' });
    expect(result).toBe('First Name\nAlice');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/desktop/renderer/src/utils/csvExport.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
function escapeField(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv<T extends Record<string, unknown>>(
  data: T[],
  columns: (keyof T & string)[],
  labels?: Partial<Record<keyof T & string, string>>
): string {
  const headerRow = columns.map(col => labels?.[col] ?? col).join(',');
  const dataRows = data.map(row =>
    columns.map(col => escapeField(row[col])).join(',')
  );
  return [headerRow, ...dataRows].join('\n');
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/desktop/renderer/src/utils/csvExport.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/utils/csvExport.ts apps/desktop/renderer/src/utils/csvExport.test.ts
git commit -m "feat: add CSV export utility with escaping and download"
```

---

## Chunk 3: Notes Page

### Task 4: Notes Page Component

**Files:**
- Create: `apps/desktop/renderer/src/pages/Notes.tsx`
- Modify: `apps/desktop/renderer/src/App.tsx` (add lazy route)
- Modify: `apps/desktop/renderer/src/components/Layout.tsx` (add nav item)

- [ ] **Step 1: Create Notes.tsx page**

Follow the pattern from `Inspections.tsx` (onSnapshot listener, search/filter, list view).

```typescript
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@dios/shared/firebase';
import { collection, onSnapshot, query, orderBy, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { logger } from '@dios/shared';
import { StickyNote, Plus, Search, CheckSquare, FileText, ListTodo, X, Calendar, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

interface Note {
  id: string;
  content: string;
  type: 'Note' | 'Todo' | 'PrepChecklist';
  operationId?: string;
  operationName?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Operation {
  id: string;
  name: string;
}

export default function Notes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Note' | 'Todo' | 'PrepChecklist'>('All');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add/Edit form state
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<Note['type']>('Note');
  const [formOperationId, setFormOperationId] = useState('');
  const [formDueDate, setFormDueDate] = useState('');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/notes`), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/notes`);
      setLoading(false);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/operations`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOperations(snapshot.docs.map(d => ({ id: d.id, name: d.data().name } as Operation)));
    });
    return unsubscribe;
  }, [user]);

  const filtered = notes.filter(n => {
    if (typeFilter !== 'All' && n.type !== typeFilter) return false;
    if (!showCompleted && n.completed) return false;
    if (search) {
      const q = search.toLowerCase();
      return n.content.toLowerCase().includes(q) ||
        (n.operationName ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const openAddModal = () => {
    setEditingNote(null);
    setFormContent('');
    setFormType('Note');
    setFormOperationId('');
    setFormDueDate('');
    setShowAddModal(true);
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setFormContent(note.content);
    setFormType(note.type);
    setFormOperationId(note.operationId ?? '');
    setFormDueDate(note.dueDate ?? '');
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!user || !formContent.trim()) return;
    const opName = operations.find(o => o.id === formOperationId)?.name;
    const now = new Date().toISOString();

    const noteData = {
      content: formContent.trim(),
      type: formType,
      operationId: formOperationId || null,
      operationName: opName || null,
      dueDate: formDueDate || null,
      completed: editingNote?.completed ?? false,
      updatedAt: now,
      ...(editingNote ? {} : { createdAt: now }),
    };

    try {
      if (editingNote) {
        await updateDoc(doc(db, `users/${user.uid}/notes/${editingNote.id}`), noteData);
      } else {
        const newRef = doc(collection(db, `users/${user.uid}/notes`));
        await setDoc(newRef, { ...noteData, id: newRef.id, createdAt: now });
      }
      setShowAddModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.SAVE, `users/${user.uid}/notes`);
    }
  };

  const toggleComplete = async (note: Note) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/notes/${note.id}`), {
        completed: !note.completed,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/notes/${note.id}`);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!user) return;
    const result = await Swal.fire({
      text: 'Delete this note?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Delete',
    });
    if (!result.isConfirmed) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/notes/${noteId}`));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/notes/${noteId}`);
    }
  };

  const typeIcon = (type: Note['type']) => {
    switch (type) {
      case 'Todo': return <ListTodo size={14} />;
      case 'PrepChecklist': return <CheckSquare size={14} />;
      default: return <FileText size={14} />;
    }
  };

  const typeColor = (type: Note['type']) => {
    switch (type) {
      case 'Todo': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'PrepChecklist': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-stone-50 text-stone-600 border-stone-200';
    }
  };

  // ... render JSX following Inspections.tsx pattern:
  // - Header with title, subtitle, Add button
  // - Content card with search bar + type filter + show-completed toggle
  // - List of notes with type badge, content, operation name, due date, complete toggle, edit/delete actions
  // - Add/Edit modal following Operations.tsx modal pattern
}
```

The full render should include:
- Page header: "Notes & Tasks" with StickyNote icon
- Toolbar: search input, type filter dropdown (All/Note/Todo/PrepChecklist), show completed toggle
- Note cards: type badge, content preview, operation link, due date, checkbox for completion
- Add/Edit modal: content textarea, type select, operation select, due date input
- Delete with SweetAlert2 confirmation

- [ ] **Step 2: Add lazy route in App.tsx**

Add import:
```typescript
const Notes = lazy(() => import('./pages/Notes'));
```

Add route inside `<Route element={<Layout />}>`:
```tsx
<Route path="/notes" element={<ProtectedRoute><Notes /></ProtectedRoute>} />
```

- [ ] **Step 3: Add nav item in Layout.tsx**

In the `SEARCH_ITEMS` array, add:
```typescript
{ name: 'Notes', path: '/notes', icon: StickyNote },
```

In the sidebar navigation under "Main" section, add a NavItem for Notes with `StickyNote` icon.

- [ ] **Step 4: Verify the page renders**

Run: `npm run dev` and navigate to `/#/notes`
Expected: Notes page renders with empty state

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/pages/Notes.tsx apps/desktop/renderer/src/App.tsx apps/desktop/renderer/src/components/Layout.tsx
git commit -m "feat: add Notes page with CRUD, type filtering, and completion tracking"
```

---

## Chunk 4: Address Autocomplete Component

### Task 5: Google Places Autocomplete

**Files:**
- Create: `apps/desktop/renderer/src/components/AddressAutocomplete.tsx`

- [ ] **Step 1: Create AddressAutocomplete component**

This component wraps a text input with Google Places Autocomplete suggestions. It uses the Google Maps JavaScript API (already loaded via `@react-google-maps/api` in the app).

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { configStore } from '@dios/shared';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (place: {
    address: string;
    city: string;
    state: string;
    county: string;
    zip: string;
    lat: number;
    lng: number;
  }) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Start typing an address...',
  className,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current || !window.google?.maps?.places) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'geometry', 'formatted_address'],
      types: ['address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      const get = (type: string) =>
        place.address_components?.find(c => c.types.includes(type))?.long_name ?? '';

      const streetNumber = get('street_number');
      const route = get('route');
      const address = [streetNumber, route].filter(Boolean).join(' ');

      onChange(place.formatted_address ?? address);
      onPlaceSelect?.({
        address,
        city: get('locality') || get('sublocality'),
        state: get('administrative_area_level_1'),
        county: get('administrative_area_level_2').replace(' County', ''),
        zip: get('postal_code'),
        lat: place.geometry?.location?.lat() ?? 0,
        lng: place.geometry?.location?.lng() ?? 0,
      });
    });

    autocompleteRef.current = autocomplete;

    return () => {
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, []);

  const inputClass = className ??
    'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none';

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}
```

**Important:** This component requires the Google Maps Places library to be loaded. It will gracefully degrade to a plain text input if Maps isn't available (local mode).

- [ ] **Step 2: Integrate into Operations.tsx Add/Edit modal**

Replace the address text input in the Operations add/edit modal with `<AddressAutocomplete>`. When a place is selected, auto-fill city, state, county, and coordinates.

- [ ] **Step 3: Integrate into OnboardingWizard.tsx Step 2 (Address)**

Replace the street address input with `<AddressAutocomplete>`. On place select, populate city, state, zip fields.

- [ ] **Step 4: Integrate into Routing.tsx origin input**

Replace the origin address text input with `<AddressAutocomplete>` for better address resolution.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/renderer/src/components/AddressAutocomplete.tsx
git add apps/desktop/renderer/src/pages/Operations.tsx
git add apps/desktop/renderer/src/components/OnboardingWizard.tsx
git add apps/desktop/renderer/src/pages/Routing.tsx
git commit -m "feat: add Google Places address autocomplete with auto-fill for city/state/county"
```

---

## Chunk 5: Inspection Scope Dropdown & County Field

### Task 6: Scope Dropdown & County on InspectionProfile

**Files:**
- Modify: `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

- [ ] **Step 1: Replace scope textarea with dropdown**

Import `INSPECTION_SCOPES` from `@dios/shared` constants. Replace the scope textarea (currently around line 512-518) with a `<select>` dropdown:

```tsx
<label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
  Scope of Inspection
</label>
<select
  value={scope}
  onChange={(e) => setScope(e.target.value)}
  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none"
>
  <option value="">Select scope...</option>
  {INSPECTION_SCOPES.map(s => (
    <option key={s} value={s}>{s}</option>
  ))}
</select>
```

- [ ] **Step 2: Add county field**

Add `county` to the local Inspection interface and form state. Add a county text input field near the address/location section.

```typescript
const [county, setCounty] = useState('');
// In useEffect where inspection data loads:
setCounty(data.county || '');
// In handleSave, include county in the update object
```

- [ ] **Step 3: Save scope and county to Firestore**

Ensure the `handleSave` function includes both `scope` and `county` in the `updateDoc` call.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/pages/InspectionProfile.tsx
git commit -m "feat: add scope dropdown and county field to inspection profile"
```

### Task 7: County on Operations

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Operations.tsx`

- [ ] **Step 1: Add county to the Operations add/edit form**

Add a county field to the local Operation interface and form state. Display it in the add/edit modal between the state and notes fields.

- [ ] **Step 2: Save county to Firestore**

Include `county` in the `setDoc` calls for creating/updating operations.

- [ ] **Step 3: Display county in the operation list if present**

Show county as part of the address line in the operation cards: `{op.address} · {op.county && `${op.county} County`}`

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/pages/Operations.tsx
git commit -m "feat: add county field to operations"
```

---

## Chunk 6: Invoice Enhancements

### Task 8: Sequential Invoice Numbering

**Files:**
- Modify: `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

- [ ] **Step 1: Replace timestamp-based invoice number**

Find the line (currently ~336):
```typescript
invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
```

Replace with a query to count existing invoices for the year, then generate:
```typescript
import { getNextInvoiceNumber } from '../utils/invoiceNumbering';

// Before generating invoice:
const year = new Date().getFullYear();
const invoicesSnap = await getDocs(collection(db, `users/${user.uid}/invoices`));
const yearCount = invoicesSnap.docs.filter(d => {
  const num = d.data().invoiceNumber as string;
  return num?.startsWith(`INV-${year}-`);
}).length;
const invoiceNumber = getNextInvoiceNumber(year, yearCount);
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/InspectionProfile.tsx
git commit -m "feat: use sequential invoice numbering (INV-YYYY-NNNN)"
```

### Task 9: Payment Method & Enhanced Invoice List

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Invoices.tsx`

- [ ] **Step 1: Add paymentMethod to InvoiceRecord interface**

```typescript
interface InvoiceRecord {
  // ... existing fields
  paymentMethod?: string;
  invoiceNumber?: string;
}
```

- [ ] **Step 2: Add payment method selector when marking as paid**

When the user clicks "Mark Paid", show a SweetAlert2 dialog with a payment method dropdown before saving:

```typescript
const handleMarkPaid = async (invoice: InvoiceRecord) => {
  const { value: paymentMethod } = await Swal.fire({
    title: 'Payment Method',
    input: 'select',
    inputOptions: {
      Check: 'Check',
      ACH: 'ACH',
      Zelle: 'Zelle',
      Venmo: 'Venmo',
      PayPal: 'PayPal',
      Cash: 'Cash',
      Other: 'Other',
    },
    inputPlaceholder: 'Select payment method',
    showCancelButton: true,
    confirmButtonColor: '#D49A6A',
  });
  if (!paymentMethod) return;

  await updateDoc(doc(db, `users/${user.uid}/invoices/${invoice.id}`), {
    status: 'Paid',
    paidDate: new Date().toISOString(),
    paymentMethod,
    updatedAt: new Date().toISOString(),
  });
};
```

- [ ] **Step 3: Display payment method and invoice number in the table**

Add columns for invoice number and payment method. Show paidDate when status is Paid.

- [ ] **Step 4: Add row status coloring**

Apply background colors to invoice rows based on status:
```typescript
const rowBg = (status: string) => {
  switch (status) {
    case 'Paid': return 'bg-emerald-50/50';
    case 'Sent': return 'bg-amber-50/30';
    default: return '';
  }
};
```

- [ ] **Step 5: Add CSV export button**

Import `generateCsv` and `downloadCsv` from `../utils/csvExport`. Add an "Export CSV" button to the page header that exports filtered invoices.

```typescript
const handleExportCsv = () => {
  const csv = generateCsv(
    filteredInvoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber ?? '',
      date: inv.date,
      operation: inv.operationName,
      agency: inv.agencyName,
      amount: inv.totalAmount,
      status: inv.status,
      paidDate: inv.paidDate ?? '',
      paymentMethod: inv.paymentMethod ?? '',
    })),
    ['invoiceNumber', 'date', 'operation', 'agency', 'amount', 'status', 'paidDate', 'paymentMethod'],
    {
      invoiceNumber: 'Invoice #',
      date: 'Date',
      operation: 'Operation',
      agency: 'Agency',
      amount: 'Amount',
      status: 'Status',
      paidDate: 'Date Paid',
      paymentMethod: 'Payment Method',
    }
  );
  downloadCsv(csv, `invoices-${selectedYear}.csv`);
};
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/renderer/src/pages/Invoices.tsx
git commit -m "feat: add payment method tracking, invoice numbers, row coloring, and CSV export to invoices"
```

---

## Chunk 7: List Row Styling & Calendar Colors

### Task 10: Inspection List Row Coloring

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Inspections.tsx`

- [ ] **Step 1: Add row background colors by status**

Apply subtle background coloring to inspection list rows:
```typescript
const rowStatusBg = (status: string) => {
  switch (status) {
    case 'Paid': return 'bg-emerald-50/50';
    case 'Cancelled': return 'opacity-60';
    case 'Invoiced': return 'bg-blue-50/30';
    default: return '';
  }
};
```

Apply the class to each row `<div>` or `<Link>` element in the list.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/Inspections.tsx
git commit -m "feat: add status-based row coloring to inspections list"
```

### Task 11: Calendar Event Color-Coding

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Schedule.tsx`

- [ ] **Step 1: Add event color mapping**

In the `eventPropGetter` callback for react-big-calendar, apply colors based on inspection status:

```typescript
const statusColor: Record<string, string> = {
  Paid: '#86efac',       // green-300
  Invoiced: '#93c5fd',   // blue-300
  Report: '#fde68a',     // amber-200
  Inspected: '#fcd34d',  // amber-300
  Prep: '#fed7aa',       // orange-200
  Scheduled: '#D49A6A',  // brand color
  Cancelled: '#d6d3d1',  // stone-300
};

const eventStyleGetter = (event: CalendarEvent) => ({
  style: {
    backgroundColor: statusColor[event.status] ?? '#D49A6A',
    color: event.status === 'Cancelled' ? '#78716c' : '#1c1917',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
  },
});
```

Pass `eventPropGetter={eventStyleGetter}` to the `<Calendar>` component.

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/Schedule.tsx
git commit -m "feat: add status-based color coding to calendar events"
```

---

## Chunk 8: Default Checklists & Settings Enhancements

### Task 12: Default Prep & Report Checklist Items

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Settings.tsx`
- Modify: `apps/desktop/renderer/src/components/AgencySettingsTab.tsx`

- [ ] **Step 1: Pre-fill default checklist items for new agencies**

In `Settings.tsx`, update the `NEW_AGENCY_TEMPLATE` constant to include default checklist items:

```typescript
import { DEFAULT_PREP_CHECKLIST_ITEMS, DEFAULT_REPORT_CHECKLIST_ITEMS } from '@dios/shared';

// In NEW_AGENCY_TEMPLATE:
prepChecklistItems: JSON.stringify(DEFAULT_PREP_CHECKLIST_ITEMS),
reportChecklistItems: JSON.stringify(DEFAULT_REPORT_CHECKLIST_ITEMS),
```

- [ ] **Step 2: Add "Reset to Defaults" button on agency checklists**

In `AgencySettingsTab.tsx`, add a small "Reset to Defaults" button next to each checklist title:

```tsx
<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-bold text-stone-800">Prep Checklist</h3>
  <button
    type="button"
    onClick={() => updateField('prepChecklistItems', JSON.stringify(DEFAULT_PREP_CHECKLIST_ITEMS))}
    className="text-xs text-[#D49A6A] hover:text-[#c28a5c] font-medium transition-colors"
  >
    Reset to Defaults
  </button>
</div>
```

Same for Report Checklist with `DEFAULT_REPORT_CHECKLIST_ITEMS`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/pages/Settings.tsx apps/desktop/renderer/src/components/AgencySettingsTab.tsx
git commit -m "feat: add default checklist items for new agencies with reset-to-defaults button"
```

### Task 13: Quick Links Section in Settings

**Files:**
- Create: `apps/desktop/renderer/src/components/QuickLinksSection.tsx`
- Modify: `apps/desktop/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Create QuickLinksSection component**

```typescript
import { useState } from 'react';
import { Plus, X, ExternalLink, GripVertical } from 'lucide-react';

interface QuickLink {
  label: string;
  url: string;
}

interface QuickLinksSectionProps {
  links: QuickLink[];
  onChange: (links: QuickLink[]) => void;
}

const inputClass = 'w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-[#D49A6A]/20 focus:border-[#D49A6A] transition-all outline-none';

export default function QuickLinksSection({ links, onChange }: QuickLinksSectionProps) {
  const handleAdd = () => {
    onChange([...links, { label: '', url: '' }]);
  };

  const handleUpdate = (index: number, field: keyof QuickLink, value: string) => {
    onChange(links.map((link, i) =>
      i === index ? { ...link, [field]: value } : link
    ));
  };

  const handleRemove = (index: number) => {
    onChange(links.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {links.length === 0 ? (
        <div className="text-sm text-stone-400 py-4 text-center border border-dashed border-stone-200 rounded-xl">
          No quick links configured
        </div>
      ) : (
        links.map((link, index) => (
          <div key={index} className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Label"
              value={link.label}
              onChange={(e) => handleUpdate(index, 'label', e.target.value)}
              className={`flex-1 ${inputClass}`}
            />
            <input
              type="url"
              placeholder="https://..."
              value={link.url}
              onChange={(e) => handleUpdate(index, 'url', e.target.value)}
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={handleAdd}
        className="text-sm font-medium text-[#D49A6A] hover:text-[#c28a5c] transition-colors flex items-center gap-1.5"
      >
        <Plus size={16} />
        Add Quick Link
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into Settings Data tab**

Add a Quick Links section card in the Settings "Data & Integrations" tab. Store quick links in Firestore `system_settings/config` as `quickLinks` (JSON string).

- [ ] **Step 3: Display quick links in Layout sidebar**

If `quickLinks` exist in config, render them in the sidebar below the navigation sections.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/renderer/src/components/QuickLinksSection.tsx apps/desktop/renderer/src/pages/Settings.tsx apps/desktop/renderer/src/components/Layout.tsx
git commit -m "feat: add configurable quick links in settings and sidebar"
```

---

## Chunk 9: Data Export & Backup

### Task 14: CSV Export on Inspections Page

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Inspections.tsx`

- [ ] **Step 1: Add export button to Inspections page header**

Import `generateCsv`, `downloadCsv`. Add an "Export" button next to the search bar. Export filtered inspections:

```typescript
const handleExport = () => {
  const csv = generateCsv(
    filteredInspections.map(insp => ({
      date: insp.date,
      operation: insp.operationName,
      agency: insp.agencyName,
      scope: insp.scope ?? '',
      status: insp.status,
      baseHours: insp.baseHoursLog,
      additionalHours: insp.additionalHoursLog,
      miles: insp.milesDriven,
      county: insp.county ?? '',
    })),
    ['date', 'operation', 'agency', 'scope', 'status', 'baseHours', 'additionalHours', 'miles', 'county'],
    {
      date: 'Date',
      operation: 'Operation',
      agency: 'Agency',
      scope: 'Scope',
      status: 'Status',
      baseHours: 'Base Hours',
      additionalHours: 'Additional Hours',
      miles: 'Miles',
      county: 'County',
    }
  );
  downloadCsv(csv, `inspections-${new Date().getFullYear()}.csv`);
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/Inspections.tsx
git commit -m "feat: add CSV export to inspections page"
```

### Task 15: Data Backup/Export Section in Settings

**Files:**
- Modify: `apps/desktop/renderer/src/pages/Settings.tsx`

- [ ] **Step 1: Add "Export All Data" button in Data tab**

Add a section in the Data & Integrations tab for exporting all user data as a JSON backup:

```typescript
const handleExportBackup = async () => {
  if (!user) return;
  const backup: Record<string, unknown[]> = {};
  const collections = ['agencies', 'operations', 'inspections', 'invoices', 'expenses', 'notes', 'tasks'];

  for (const col of collections) {
    const snap = await getDocs(collection(db, `users/${user.uid}/${col}`));
    backup[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `dios-backup-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
  Swal.fire({ text: 'Backup exported successfully!', icon: 'success', timer: 1500, showConfirmButton: false });
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/renderer/src/pages/Settings.tsx
git commit -m "feat: add JSON data backup export to settings"
```

---

## Chunk 10: Drive Auto-Folder Creation & Invoice PDF Upload

### Task 16: Auto-Create Operation Folders in Drive

**Files:**
- Modify: `apps/desktop/renderer/src/lib/driveSync.ts`

- [ ] **Step 1: Add ensureOperationFolder function**

```typescript
export async function ensureOperationFolder(
  accessToken: string,
  userId: string,
  agencyName: string,
  operationName: string
): Promise<string | null> {
  // Uses existing folder creation logic from uploadToDrive
  // Creates Agencies/{agency}/{operation}/ if it doesn't exist
  // Returns the folder ID
}
```

- [ ] **Step 2: Call on operation creation**

In `Operations.tsx`, after creating a new operation, call `ensureOperationFolder` (fire and forget) if the user has a Google access token.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/lib/driveSync.ts apps/desktop/renderer/src/pages/Operations.tsx
git commit -m "feat: auto-create Google Drive folder when adding operations"
```

### Task 17: Auto-Save Invoice PDF to Drive

**Files:**
- Modify: `apps/desktop/renderer/src/pages/InspectionProfile.tsx`

- [ ] **Step 1: Queue invoice PDF for Drive upload after generation**

The invoice PDF generation already uses `queueFile` from `syncQueue.ts`. Verify it's uploading to the correct folder path (Agencies/{agency}/{operation}/{year}/).

Check the existing `queueFile` call and ensure it includes `agencyName`, `operationName`, and year so `driveSync.uploadToDrive` puts it in the right folder.

- [ ] **Step 2: Commit if changes needed**

```bash
git add apps/desktop/renderer/src/pages/InspectionProfile.tsx
git commit -m "fix: ensure invoice PDFs upload to correct Drive folder hierarchy"
```

---

## Chunk 11: Google Calendar Auto-Sync

### Task 18: Calendar Sync on Inspection Creation

**Files:**
- Modify: `apps/desktop/renderer/src/pages/OperationProfile.tsx`

- [ ] **Step 1: Add calendar event creation after adding inspection**

When a new inspection is created from the OperationProfile page (via the "Schedule Inspection" or step modals), auto-create a Google Calendar event if the user has a Google access token:

```typescript
const createCalendarEvent = async (inspection: { date: string; operationName: string; scope?: string; status: string }) => {
  if (!googleAccessToken) return;
  try {
    const event = {
      summary: `${inspection.operationName} — ${inspection.scope ?? 'Inspection'}`,
      description: `Status: ${inspection.status}\nScope: ${inspection.scope ?? 'N/A'}`,
      start: { date: inspection.date },
      end: { date: inspection.date },
      colorId: getCalendarColorId(inspection.status),
    };
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );
    if (response.ok) {
      const data = await response.json();
      // Save the event ID back to the inspection for future updates
      return data.id;
    }
  } catch (error) {
    logger.error('Failed to create calendar event:', error);
  }
  return null;
};

function getCalendarColorId(status: string): string {
  // Google Calendar color IDs: https://developers.google.com/calendar/api/v3/reference/colors
  switch (status) {
    case 'Paid': return '10';      // green
    case 'Invoiced': return '9';   // blue
    case 'Scheduled': return '6';  // orange
    case 'Prep': return '5';       // yellow
    case 'Inspected': return '5';  // yellow
    case 'Report': return '5';     // yellow
    case 'Cancelled': return '8';  // grey
    default: return '6';           // orange
  }
}
```

- [ ] **Step 2: Store calendar event ID on the inspection document**

Save `googleCalendarEventId` on the inspection Firestore document so it can be updated/deleted later.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/renderer/src/pages/OperationProfile.tsx
git commit -m "feat: auto-create Google Calendar event when scheduling inspections"
```

---

## Chunk 12: MIE Tier Pricing

### Task 19: Meals & Incidentals Tier Pricing

**Files:**
- Modify: `apps/desktop/renderer/src/utils/invoiceCalculator.ts`
- Modify: `packages/shared/src/constants.ts`

- [ ] **Step 1: Add MIE tier constants**

In `constants.ts`:
```typescript
export const MIE_TIERS = [
  { label: 'Tier 1 (75% first/last day)', rate: 0.75 },
  { label: 'Tier 2 (full day)', rate: 1.0 },
  { label: 'Tier 3 (high-cost area)', rate: 1.25 },
] as const;

export const DEFAULT_PER_DIEM_RATE = 59; // GSA standard M&IE rate
```

- [ ] **Step 2: Update invoiceCalculator to support tiered meals**

In `calculateInvoiceLineItems`, if `inspection.perDiemDays > 0` and the agency has a per diem rate, calculate meals using the tier system. The inspection's `mealsAndExpenses` field can carry a tier multiplier or the calculator can use the raw perDiemDays with the agency's perDiemRate.

No change needed if the existing logic already multiplies `perDiemDays * perDiemRate` — just ensure it's working correctly.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants.ts apps/desktop/renderer/src/utils/invoiceCalculator.ts
git commit -m "feat: add MIE tier pricing constants for per diem calculations"
```

---

## Verification

After all tasks are complete:

- [ ] **Run full test suite**: `npx vitest run`
- [ ] **Verify build**: `npx tsc --noEmit`
- [ ] **Start dev server**: `npm run dev`
- [ ] **Manual verification** of all new features:
  - Notes page CRUD
  - Address autocomplete (requires Maps API key)
  - Scope dropdown on inspections
  - County field on inspections and operations
  - Invoice numbering (INV-2026-0001 format)
  - Payment method selection when marking paid
  - Row coloring on inspections and invoices
  - Calendar event colors
  - CSV export on invoices and inspections pages
  - Quick links in settings and sidebar
  - Data backup export
  - Default checklist items on new agencies
