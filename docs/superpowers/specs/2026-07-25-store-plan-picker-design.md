# Store Plan Picker — Design

- **Date:** 2026-07-25
- **Status:** Approved design, pending implementation plan
- **Scope:** Frontend only (React `web-store-pos`). No backend, DB, permissions, or billing changes.

## Goal

Replace the per-module price table in the store create/edit form (`management/stores`)
with a **two-plan selector** — **Gratis** (free) and **Pago** (paid) — presented as
**two tabs**. The user sees which plan is active, can switch to the other plan, and the
paid plan shows a **single summed price** (no per-module pricing). All plan/price/active
data is **derived from the existing `modules` response** — nothing new is fetched.

## Current state (what this replaces)

- `management/stores/components/module-picker.tsx` (`ModulePicker`): a table of all
  modules with per-module checkboxes and per-module price. `priceIncluded` modules are
  locked-checked; others toggle individually. Emits `moduleIds[]` via `onChange`.
- `management/stores/components/store-form.tsx` renders `<ModulePicker modules onChange={setModuleIds} />`
  and submits `moduleIds` with the existing **"Guardar"** button.
- `Module` shape (`packages/domain/src/models/store.ts`):
  `{ id, name, price, currentPrice, priceIncluded, discountText, selected }`.

The new component is a **drop-in replacement** that emits the same `moduleIds[]`, so the
form's submit path is unchanged.

## Design

### Component: `PlanPicker` (new, replaces `ModulePicker`)

- File: `management/stores/components/plan-picker.tsx`, `PlanPicker`.
- Props: unchanged from `ModulePicker` — `{ modules: Module[]; onChange: (selectedIds: number[]) => void }`.
- Presentational only. Owns two pieces of state: `selectedPlan: 'free' | 'paid'` and the
  active tab. Derives everything else from `modules`.
- `module-picker.tsx` and its test are **deleted** (sole consumer is `store-form`; verified
  during planning).

### Data derivation (all from the response)

- **Free plan modules** = `modules.filter(m => m.priceIncluded)`. Plan price = `$0.00`.
- **Paid plan** = the whole catalog (free modules + paid modules). Paid modules =
  `modules.filter(m => !m.priceIncluded)`.
- **Paid plan price** = `sum(paidModules.map(m => m.currentPrice))` — the single total to
  pay. No per-module price is shown anywhere.
- **Active plan** = `paidModules.some(m => m.selected) ? 'paid' : 'free'` (see Legacy rule).
- **On plan selection**, `onChange` emits:
  - `free` → ids of `priceIncluded` modules only.
  - `paid` → **all** module ids.

### Layout: billing banner + two tabs

Mobile-first (the app runs on narrow phone widths).

1. **Section title:** `Plan de la tienda`.
2. **Billing banner** (top, always visible, informational — static copy):
   > Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.
3. **Two tabs:**
   - `Gratis`
   - `Pago · <total>` — the tab label includes the formatted paid total, e.g. `Pago · $2,000.00`.
   - The active-plan tab shows an **"Activo"** badge so the current plan is visible without
     switching tabs.
4. **Tab panel** (content of the selected tab):
   - **Gratis panel:** `Incluye:` + list of free module names (no prices).
   - **Pago panel:** `Todo lo del plan Gratis, y además:` + list of paid module names (no prices).
   - A single **plan action** control:
     - If this tab's plan is the currently-**selected** plan: static label
       `Plan seleccionado` (with a filled/selected indicator).
     - If not selected: an **"Activar este plan"** control that selects it.
   - When the selected plan differs from the **active** plan, show the hint
     `Se activará al guardar`. The **"Activo"** tab badge remains the only signal of the
     plan actually in effect today (avoids implying an unsaved selection is already active).

`ModulePicker`'s tradeoff (tabs hide the other plan) is accepted: the "Activo" badge on the
tab keeps the current plan visible, and the banner sells the paid plan up front.

### Active vs Selected — two distinct concepts

- **Active plan** = what the store has today (derived from `modules[].selected`). Immutable
  in this component; drives the "Activo" badge.
- **Selected plan** = what the user is choosing now. Mutable. On **Guardar**, the selected
  plan is persisted (via the emitted `moduleIds`) and becomes active.
- On mount, `selectedPlan` initializes to the **active** plan. The component does **not**
  emit on mount — the parent's existing `moduleIds` init already reflects the store's real
  modules, avoiding any silent grant. `onChange` fires only on an actual user plan switch.

### Integration into `store-form.tsx`

- Replace `<ModulePicker modules={modules} onChange={setModuleIds} />` with
  `<PlanPicker modules={modules} onChange={setModuleIds} />`.
- `moduleIds` initialization stays: `modules.filter(m => m.priceIncluded || m.selected).map(m => m.id)`.
- The **"Guardar"** button and submit payload are unchanged.

### Legacy stores rule (confirmed)

A store may historically hold **some** paid modules (the old per-module model allowed this).
Rule: **any** paid module with `selected === true` ⇒ active plan is **Pago**. Choosing Pago
grants **all** paid modules. Partial legacy stores are normalized to the full paid set only
when the user actively selects Pago and saves — never silently on mount.

### UI copy (neutral Latin American Spanish — NO voseo)

New i18n keys in `shared/lib/i18n/es.ts`:

| Key | Value |
|---|---|
| `STORES.PLAN.SECTION_TITLE` | `Plan de la tienda` |
| `STORES.PLAN.BILLING_NOTICE` | `Plan Pago: 1 mes GRATIS. Luego se cobra por mes vencido → el primer pago después del segundo mes.` |
| `STORES.PLAN.FREE_TAB` | `Gratis` |
| `STORES.PLAN.PAID_TAB` | `Pago` (the price is appended at render: `Pago · {total}`) |
| `STORES.PLAN.ACTIVE_BADGE` | `Activo` |
| `STORES.PLAN.INCLUDES` | `Incluye:` |
| `STORES.PLAN.INCLUDES_FREE_PLUS` | `Todo lo del plan Gratis, y además:` |
| `STORES.PLAN.SELECTED` | `Plan seleccionado` |
| `STORES.PLAN.ACTIVATE` | `Activar este plan` |
| `STORES.PLAN.WILL_ACTIVATE_ON_SAVE` | `Se activará al guardar` |

Free price renders as `formatCurrency(0)` (`$0.00`); paid price as `formatCurrency(paidTotal)`.

### Edge cases

- **No paid modules** in the catalog (`paidModules.length === 0`): paid total is `$0.00`;
  the Pago tab still renders but offers nothing beyond Gratis. (Not expected in practice;
  handled gracefully, no crash.)
- **Create mode** (new store, all `selected === false`): active plan = Gratis; `moduleIds`
  init = free ids. Selecting Pago emits all ids.
- **Discounts:** the paid total already uses `currentPrice`, so any discount baked into the
  response is reflected. Per-module `discountText`/struck-through price is intentionally
  dropped (no per-module pricing in the plan view).

### Testing

New `plan-picker.test.tsx`:
- Derives free plan = `priceIncluded` modules; paid plan = all modules.
- Paid total = sum of paid `currentPrice`; free price = `$0.00`.
- Active badge on Pago when any paid module `selected`; on Gratis otherwise.
- Selecting Pago emits **all** ids; selecting Gratis emits only `priceIncluded` ids.
- `Se activará al guardar` hint shows only when selected ≠ active.
- No `onChange` on mount.

Update/replace: delete `module-picker.test.tsx`; adjust any `store-form` test that referenced
the old module table to reference the plan tabs.

## Out of scope

- Backend, DB schema, permissions/gating (`isUserAuthorized`, `isModuleAvailable`,
  `StoreRoleFeatures`) — untouched. "Plan" here is a **UI-derived concept** over
  `priceIncluded`, not a new DB entity.
- The real billing/subscription mechanics (`StorePayment`, trial period). The billing banner
  is **static informational copy** with the user's exact wording; it is not driven by the
  response in this scope.
