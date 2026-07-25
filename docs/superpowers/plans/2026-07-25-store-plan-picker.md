# Store Plan Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-module price table (`ModulePicker`) in the store create/edit form with a two-plan tab selector (`PlanPicker`) — Gratis / Pago — driven entirely by the existing `modules` response.

**Architecture:** A new presentational component `PlanPicker` derives two plans from the `modules[]` prop (`priceIncluded` → free; the rest → paid, summed into one price), renders them as two tabs with an "Activo" badge on the store's current plan, and emits the same `moduleIds[]` as `ModulePicker` so the store form's existing submit path is unchanged. No backend, DB, permissions, or billing changes.

**Tech Stack:** React 19, react-router 7 (SPA), react-intl, Tailwind, Vitest + @testing-library/react. Package: `frontend-react/apps/web-store-pos`.

## Global Constraints

- **UI copy = neutral Latin American Spanish. NO voseo** (no "tenés/pagás/elegí/activá/vos"). Use impersonal/neutral or tuteo.
- **Strict TDD:** write the failing test first, watch it fail, then implement.
- **Frontend only.** Do NOT touch backend, DB, permissions (`isUserAuthorized`, `isModuleAvailable`, `StoreRoleFeatures`), or billing.
- **Billing notice is static copy, verbatim:** `Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.`
- **Currency:** always `formatCurrency` from `~/shared/lib/format-currency` (renders `$0.00`, `$2,000.00`).
- **Test runner** (run from `frontend-react/apps/web-store-pos`): `./node_modules/.bin/vitest run <path>`.
- **Module shape** (`@store-mgmt/domain`): `{ id:number, name:string, price:number, currentPrice:number, priceIncluded:boolean, discountText:string, selected:boolean }`.
- **Plan derivation is the single source of truth** — reuse these helpers everywhere:
  - free modules = `modules.filter(m => m.priceIncluded)`
  - paid modules = `modules.filter(m => !m.priceIncluded)`
  - paid total = sum of paid `currentPrice`
  - active plan = `paidModules.some(m => m.selected) ? 'paid' : 'free'`
  - plan module ids: `paid` → all ids; `free` → free ids only

---

### Task 1: `PlanPicker` — i18n keys, derivation, tabs, badge, rendering

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts` (add `STORES.PLAN.*` keys near the other `STORES.*` entries)
- Create: `frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx`
- Create: `frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx`

**Interfaces:**
- Produces: `PlanPicker({ modules: Module[]; onChange: (selectedIds: number[]) => void })` — default + named export.

- [ ] **Step 1: Add the i18n keys**

In `shared/lib/i18n/es.ts`, add these entries in the `// Stores` area (before `'STORES.MODULES_LABEL'`):

```ts
  'STORES.PLAN.SECTION_TITLE': 'Plan de la tienda',
  'STORES.PLAN.BILLING_NOTICE': 'Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.',
  'STORES.PLAN.FREE_TAB': 'Gratis',
  'STORES.PLAN.PAID_TAB': 'Pago',
  'STORES.PLAN.ACTIVE_BADGE': 'Activo',
  'STORES.PLAN.INCLUDES': 'Incluye:',
  'STORES.PLAN.INCLUDES_FREE_PLUS': 'Todo lo del plan Gratis, y además:',
  'STORES.PLAN.SELECTED': 'Plan seleccionado',
  'STORES.PLAN.ACTIVATE': 'Activar este plan',
  'STORES.PLAN.WILL_ACTIVATE_ON_SAVE': 'Se activará al guardar',
```

- [ ] **Step 2: Write the failing test file (rendering + derivation + badge + tab nav)**

Create `management/stores/components/__tests__/plan-picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module } from '@store-mgmt/domain';

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '',
    selected: false,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// free: Ventas(1). paid: Reportes(2, $1500), Créditos(3, $500) => total $2000
const CATALOG: Module[] = [
  makeModule({ id: 1, name: 'Ventas', priceIncluded: true, currentPrice: 0 }),
  makeModule({ id: 2, name: 'Reportes', priceIncluded: false, currentPrice: 1500 }),
  makeModule({ id: 3, name: 'Créditos', priceIncluded: false, currentPrice: 500 }),
];

describe('PlanPicker — PLAN-1: section title + billing notice', () => {
  it('renders the section title and the verbatim billing notice', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByText('Plan de la tienda')).toBeInTheDocument();
    expect(
      screen.getByText('Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.')
    ).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-2: paid tab label shows the summed total', () => {
  it('shows "Pago" with the sum of paid currentPrice formatted as USD', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('$2,000.00');
  });
});

describe('PlanPicker — PLAN-3: module lists per tab (no prices)', () => {
  it('free tab lists free modules; paid tab lists paid modules after switching', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    // default tab = active plan = free (no paid selected)
    expect(screen.getByText('Ventas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.getByText('Créditos')).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-4: active badge', () => {
  it('shows Activo on the Gratis tab when no paid module is selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Gratis/ })).toHaveTextContent('Activo');
  });

  it('shows Activo on the Pago tab when a paid module is selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const modules = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    render(<Wrapper><PlanPicker modules={modules} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('Activo');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run app/management/stores/components/__tests__/plan-picker.test.tsx`
Expected: FAIL — `Cannot find module '../plan-picker'`.

- [ ] **Step 4: Implement `plan-picker.tsx` (rendering + derivation + tabs)**

Create `management/stores/components/plan-picker.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Module } from '@store-mgmt/domain';
import { formatCurrency } from '~/shared/lib/format-currency';

interface PlanPickerProps {
  modules: Module[];
  onChange: (selectedIds: number[]) => void;
}

type Plan = 'free' | 'paid';

const getFreeModules = (modules: Module[]) => modules.filter((m) => m.priceIncluded);
const getPaidModules = (modules: Module[]) => modules.filter((m) => !m.priceIncluded);
const getPaidTotal = (modules: Module[]) =>
  getPaidModules(modules).reduce((sum, m) => sum + m.currentPrice, 0);
const getActivePlan = (modules: Module[]): Plan =>
  getPaidModules(modules).some((m) => m.selected) ? 'paid' : 'free';
const getPlanModuleIds = (modules: Module[], plan: Plan) =>
  (plan === 'paid' ? modules : getFreeModules(modules)).map((m) => m.id);

export function PlanPicker({ modules, onChange }: PlanPickerProps) {
  const intl = useIntl();
  const t = (id: string) => intl.formatMessage({ id });
  const active = getActivePlan(modules);
  const [selected, setSelected] = useState<Plan>(active);
  const [tab, setTab] = useState<Plan>(active);

  // Sync to the store's active plan when modules arrive/refresh async.
  // Never call onChange here — the parent already holds the correct init moduleIds.
  useEffect(() => {
    const next = getActivePlan(modules);
    setSelected(next);
    setTab(next);
  }, [modules]);

  const paidTotal = getPaidTotal(modules);
  const panelModules = tab === 'free' ? getFreeModules(modules) : getPaidModules(modules);

  function choosePlan(plan: Plan) {
    setSelected(plan);
    onChange(getPlanModuleIds(modules, plan));
  }

  function tabClass(isActive: boolean) {
    return `flex items-center gap-2 px-4 py-2 text-sm font-medium ${
      isActive ? 'border-b-2 border-primary text-primary' : 'text-gray-500'
    }`;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">{t('STORES.PLAN.SECTION_TITLE')}</p>

      <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        {t('STORES.PLAN.BILLING_NOTICE')}
      </p>

      <div className="flex border-b border-gray-200" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'free'}
          onClick={() => setTab('free')} className={tabClass(tab === 'free')}>
          {t('STORES.PLAN.FREE_TAB')}
          {active === 'free' && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              {t('STORES.PLAN.ACTIVE_BADGE')}
            </span>
          )}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'paid'}
          onClick={() => setTab('paid')} className={tabClass(tab === 'paid')}>
          {`${t('STORES.PLAN.PAID_TAB')} · ${formatCurrency(paidTotal)}`}
          {active === 'paid' && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
              {t('STORES.PLAN.ACTIVE_BADGE')}
            </span>
          )}
        </button>
      </div>

      <div role="tabpanel" className="space-y-2">
        <p className="text-sm text-gray-700">
          {tab === 'free' ? t('STORES.PLAN.INCLUDES') : t('STORES.PLAN.INCLUDES_FREE_PLUS')}
        </p>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {panelModules.map((m) => (
            <li key={m.id}>{m.name}</li>
          ))}
        </ul>

        {selected === tab ? (
          <p className="text-sm font-medium text-primary">{t('STORES.PLAN.SELECTED')}</p>
        ) : (
          <button type="button" onClick={() => choosePlan(tab)}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white">
            {t('STORES.PLAN.ACTIVATE')}
          </button>
        )}

        {selected === tab && selected !== active && (
          <p className="text-xs text-amber-700">{t('STORES.PLAN.WILL_ACTIVATE_ON_SAVE')}</p>
        )}
      </div>
    </div>
  );
}

export default PlanPicker;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/management/stores/components/__tests__/plan-picker.test.tsx`
Expected: PASS (all PLAN-1..PLAN-4 cases).

- [ ] **Step 6: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts \
        frontend-react/apps/web-store-pos/app/management/stores/components/plan-picker.tsx \
        frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx
git commit -m "feat(ui): add PlanPicker (Gratis/Pago tabs) — rendering, derivation, active badge"
```

---

### Task 2: `PlanPicker` — selection, emit, and no-emit-on-mount

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx` (append cases)

**Interfaces:**
- Consumes: `PlanPicker` from Task 1 (component already emits via `choosePlan` → `onChange`). This task adds the tests that pin that behavior. If any test fails, fix `plan-picker.tsx` minimally — do not change its public props.

- [ ] **Step 1: Append the failing interaction tests**

Append to `__tests__/plan-picker.test.tsx`:

```tsx
describe('PlanPicker — PLAN-5: initial selection = active plan, no emit on mount', () => {
  it('marks the active plan as selected and does not call onChange on mount', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} /></Wrapper>);
    // active = free; free tab is shown and marked selected
    expect(screen.getByText('Plan seleccionado')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('PlanPicker — PLAN-6: activating Pago emits ALL module ids', () => {
  it('emits every module id when the paid plan is activated', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={onChange} /></Wrapper>);
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(onChange).toHaveBeenCalledWith([1, 2, 3]);
  });
});

describe('PlanPicker — PLAN-7: activating Gratis emits only free ids', () => {
  it('emits only priceIncluded ids when the free plan is activated', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const onChange = vi.fn();
    // active = paid (Reportes selected) so Gratis is not the selected plan
    const modules = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    render(<Wrapper><PlanPicker modules={modules} onChange={onChange} /></Wrapper>);
    fireEvent.click(screen.getByRole('tab', { name: /Gratis/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });
});

describe('PlanPicker — PLAN-8: "Se activará al guardar" hint', () => {
  it('shows the hint on the selected plan when it differs from the active plan', async () => {
    const { PlanPicker } = await import('../plan-picker');
    render(<Wrapper><PlanPicker modules={CATALOG} onChange={vi.fn()} /></Wrapper>);
    // active = free; activate Pago → selected(paid) !== active(free)
    fireEvent.click(screen.getByRole('tab', { name: /Pago/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar este plan' }));
    expect(screen.getByText('Se activará al guardar')).toBeInTheDocument();
  });
});

describe('PlanPicker — PLAN-9: re-syncs to active plan when modules arrive async', () => {
  it('moves the Activo badge to Pago after modules load with a paid module selected', async () => {
    const { PlanPicker } = await import('../plan-picker');
    const { rerender } = render(<Wrapper><PlanPicker modules={[]} onChange={vi.fn()} /></Wrapper>);
    const loaded = CATALOG.map((m) => (m.id === 2 ? { ...m, selected: true } : m));
    rerender(<Wrapper><PlanPicker modules={loaded} onChange={vi.fn()} /></Wrapper>);
    expect(screen.getByRole('tab', { name: /Pago/ })).toHaveTextContent('Activo');
  });
});
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run app/management/stores/components/__tests__/plan-picker.test.tsx`
Expected: PASS — the Task 1 implementation already satisfies these. If any case fails, fix `plan-picker.tsx` minimally (do not change the `{ modules, onChange }` prop contract), then re-run.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/plan-picker.test.tsx
git commit -m "test(ui): PlanPicker selection/emit + async re-sync"
```

---

### Task 3: Integrate into `store-form` and remove `ModulePicker`

**Files:**
- Modify: `frontend-react/apps/web-store-pos/app/management/stores/components/store-form.tsx:7,236`
- Delete: `frontend-react/apps/web-store-pos/app/management/stores/components/module-picker.tsx`
- Delete: `frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/module-picker.test.tsx`

**Interfaces:**
- Consumes: `PlanPicker` (Task 1). `store-form`'s `moduleIds` state and submit payload are unchanged.

- [ ] **Step 1: Swap the component in `store-form.tsx`**

Change the import (line 7):

```tsx
import { PlanPicker } from './plan-picker';
```

Change the usage (line 236):

```tsx
          <PlanPicker modules={modules} onChange={setModuleIds} />
```

Leave everything else in `store-form.tsx` untouched (the `moduleIds` init `modules.filter((m) => m.priceIncluded || m.selected).map((m) => m.id)` stays, and the submit payload stays).

- [ ] **Step 2: Delete the old component and its test**

```bash
git rm frontend-react/apps/web-store-pos/app/management/stores/components/module-picker.tsx \
       frontend-react/apps/web-store-pos/app/management/stores/components/__tests__/module-picker.test.tsx
```

- [ ] **Step 3: Run the full stores suite + typecheck**

Run (from `frontend-react/apps/web-store-pos`):
`./node_modules/.bin/vitest run app/management/stores`
Expected: PASS — `plan-picker.test.tsx`, `store-form.test.tsx`, `store-routes.test.tsx` all green; no reference to the deleted `module-picker` remains.

Then typecheck:
`npm run typecheck`
Expected: no errors (no dangling `ModulePicker` import).

- [ ] **Step 4: Commit**

```bash
git add frontend-react/apps/web-store-pos/app/management/stores/components/store-form.tsx
git commit -m "feat(ui): use PlanPicker in store form; remove per-module ModulePicker"
```

---

## Notes / out of scope

- The old `STORES.MODULES_LABEL / MODULES_PRICE / MODULES_TOTAL / SELECT_ALL_MODULES` i18n keys become unused after `ModulePicker` is deleted. Leaving them in `es.ts` is harmless; do NOT remove them (avoids touching unrelated code).
- No backend/DB/permissions/billing changes. "Plan" is a UI-derived concept over `priceIncluded`.
- The billing notice is static copy (verbatim in Global Constraints), not response-driven.
