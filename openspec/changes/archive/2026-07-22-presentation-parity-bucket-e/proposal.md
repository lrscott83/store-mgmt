# Proposal: Presentation Parity — Bucket E

## Intent

Bucket E of the Angular→React presentation-parity audit — the final cosmetic cleanup pass. Five low-severity UI divergences remain where the React app drifted from the Angular source of truth (`frontend/src/app/presentation/`): payment-method icons dropped from two expense views, admin dashboard range buttons with no active state, the owner "Gestor" (reseller) field in the wrong position, an inverted price·stores label on the owner card, and a redundant category sub-label + extra "Disponible" block on the inventory-available row. Fix them by mirroring Angular exactly. No new behavior, no new abstraction — every piece already exists in React shared code. Success = the five views render pixel-intent-identical to their Angular counterparts.

One deliberate divergence is preserved (already decided in the audit): the owner card keeps React's correct pluralization where Angular's is a bug (Angular always renders the singular "tienda").

## Scope

### In Scope

1. **Payment-method icon before the total — two views.** Angular renders the payment-type glyph (`<i class="bi {getPaymentTypeIcon()} text-success fs-4">`) before amounts. React already ported this map (`shared/lib/payment-type-icon.ts` + `PaymentMethodIcon` in `icons.tsx`) and uses it in `expenses/components/expense-list.tsx:65`, but two views lost it:
   - **(a) Cuadre del día — Gastos rows.** `sales/routes/today-stats.tsx:232-233` renders `${expense.total}` with no icon. Add `<PaymentMethodIcon kind={getPaymentTypeIconKind(expense.paymentType)} className="text-success" />` immediately before the total, mirroring `expense-list.component.html:12`.
   - **(b) Gastos history radio filter.** `expenses/routes/expenses-history.tsx:146-157` renders each `PAYMENT_TYPE_OPTIONS` label with no glyph. Angular (`expenses.component.html:18-23`) shows the icon only for real payment types — the "Todas"/`null` option has NO icon (`expenses.component.html:15-17`). Add the icon before the label for options where `opt.value != null` only.

2. **Admin dashboard range buttons — active state.** Angular `admin-dashboard/admin-dashboard.component.html:13-14` marks the selected range via `[class.active]="viewType === '7days'"` / `[class.active]="viewType === '30days'"`. React `admin/dashboard/routes/dashboard.tsx:57-74` maintains `viewType` state but never applies an active class to either button. Apply an active style bound to `viewType` on both buttons. (Note: `statistics/dashboard` is a different component — currency toggle — and is out of scope.)

3. **Owner "Gestor" (reseller) field position.** React always renders the reSeller `<select>` last (after Descripción); Angular places it near the top.
   - **Create** — Angular `create-owner.component.html:17-28` renders reSeller **FIRST** (before Full Name). React `admin/owners/routes/owner-create.tsx:242-260` renders it last. Move the `isSuperAdmin` reSeller block to the top of the form, before Full Name.
   - **Edit** — Angular `edit-owner-details.component.html:27-39` renders reSeller **THIRD** (after Full Name, before the `isActive` toggle). React `admin/owners/routes/owner-edit.tsx:270-289` renders it last. Move the block to sit after Full Name (`owner-edit.tsx:200-212`) and before the `isActive` block (`owner-edit.tsx:214-227`).

4. **Owner card price·stores label — order/format.** Angular `owners.component.html:70` renders `{{ price | currency }} {{ getOwnerStoreCountText }}` → **"$100.00 en 3 tiendas"** (price first, then " en N tiendas"). React `admin/owners/components/owner-card-list.tsx:41-45` renders **"3 tiendas — $100.00"** (order inverted, em-dash instead of "en"). Fix: put the currency first, then `en {count-label}`, drop the em-dash. **KEEP React's correct pluralization** (`OWNER.STORE_PRICE_LABEL: '{count, plural, one {# tienda} other {# tiendas}}'`, es.ts:690) — Angular's `OWNER.STORE_SINGLE_PRICE: 'en {{count}} tienda'` (always singular) is a bug we do NOT replicate. Only the order and the "en" connective change.

5. **Inventario Disponible row — drop redundant category sub-label + extra "Disponible" block.** Angular `inventory-product-list.component.html:12-29` renders the product row as: left cell `{{productName}} ({{quantity}})`, then `costPrice` currency, then `costPrice * quantity` currency. No per-product `categoryName` (it is already the accordion header) and no "Disponible" stat block — the quantity is inline in parentheses next to the name. React `inventory/components/inventory-product-list.tsx:101-122` adds a redundant `categoryName` sub-label (line 105) and a separate "Disponible" block (`totalAvailable` + `INVENTORY.ENTRY.AVAILABLE` label, lines 108-111). Fix: render the quantity inline next to the name (`{p.productName} ({p.totalAvailable})`), remove the `categoryName` sub-label and the "Disponible" block; keep the two currency lines (avg cost + total value) that mirror Angular's two currency cells.

### Out of Scope (parity-safe exclusions)

- **Buckets B, C, D** — untouched. Bucket C is already archived (`2026-07-22-presentation-parity-bucket-c`); B and D belong to their own changes.
- **`statistics/dashboard`** (currency-toggle dashboard) — not the admin range-button dashboard; no divergence in scope here.
- **Angular dead/commented markup** (e.g. commented gear menus in `inventory-product-list.component.html:30-45`, commented owner toolbar fab) — not a gap; not replicated.
- **Owner card gear-menu actions** — already settled in a prior change (Edit/Delete live only); no change.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. Pure presentation parity — no requirement/behavior changes at the spec level.

## Approach

Mechanical reuse of existing shared React pieces — zero new abstractions:

| Need | Existing piece to reuse |
|------|-------------------------|
| Payment glyph | `PaymentMethodIcon` (icons.tsx) + `getPaymentTypeIconKind` (shared/lib/payment-type-icon.ts) — already wired in expense-list.tsx:65 |
| Active button state | Conditional class on `viewType` state already held in `admin/dashboard/routes/dashboard.tsx` |
| Field reorder | Move existing JSX blocks — no markup rewrite |
| Label fix | Existing i18n key `OWNER.STORE_PRICE_LABEL` (es.ts:690) + literal "en " connective |
| Row cleanup | Delete two JSX nodes, inline the quantity into the name |

Verdict discipline: Angular source vs React source only. Angular's singular-only store-count and its commented-out markup are not requirements. The one intentional divergence (correct React pluralization) is explicitly preserved per the audit decision.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| sales/routes/today-stats.tsx | Modified | payment icon before Gastos row total (item 1a) |
| expenses/routes/expenses-history.tsx | Modified | payment icon before radio labels, non-null only (item 1b) |
| admin/dashboard/routes/dashboard.tsx | Modified | active class on 7/30-day buttons (item 2) |
| admin/owners/routes/owner-create.tsx | Modified | reSeller field moved first (item 3) |
| admin/owners/routes/owner-edit.tsx | Modified | reSeller field moved to third (item 3) |
| admin/owners/components/owner-card-list.tsx | Modified | price·stores label order/format (item 4) |
| inventory/components/inventory-product-list.tsx | Modified | drop category sub-label + Disponible block, inline qty (item 5) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Over-fixing a look-alike (e.g. touching statistics/dashboard) | Low | Scope pins exact file:line; statistics/dashboard explicitly excluded |
| Accidentally replicating Angular's singular-store bug | Low | Item 4 spelled out: keep React plural, change only order + "en" |
| Active-button style choice not matching Angular `.active` visuals | Low | Cosmetic; mirror intent (highlight selected), use existing tokens |
| Reordering reSeller block breaks form state wiring | Low | Move JSX only; state/handlers unchanged — pure DOM order |

All items are pure presentation. No data, migrations, guards, or contract changes. Blast radius is per-component.

## Testing Strategy

Strict-TDD applies where the change is unit-testable via component render assertions:
- Item 1a/1b, item 4, item 5: assertable through render tests (icon presence per payment type, label string "$… en N tiendas", absence of categoryName/Disponible nodes, inline `(quantity)` in the name).
- Item 2: assert the selected button carries the active class for the current `viewType`.
- Item 3: assert field DOM order (reSeller before Full Name in create; reSeller between Full Name and isActive in edit).

Where a change is purely visual (exact class/token styling with no behavioral assertion), it is cosmetic-only and verified by inspection against the Angular template rather than a unit test.

## Rollback Plan

Commits-only on the working branch. Revert the offending commit(s); no shared-component signature changes means no cross-cutting blast radius. No migrations, no data changes.

## Dependencies

- None. All shared pieces (`PaymentMethodIcon`, `getPaymentTypeIconKind`, i18n keys, `viewType` state) already exist.

## Success Criteria

- [ ] Gastos rows (Cuadre del día) and the Gastos-history radio filter show the payment glyph before amounts, mirroring Angular; "Todas" radio has no glyph.
- [ ] Admin dashboard highlights the selected range button via an active state bound to `viewType`.
- [ ] Owner create renders reSeller first; owner edit renders it third (after Full Name, before Activo).
- [ ] Owner card renders "$100.00 en 3 tiendas" (price first, "en", plural preserved) — em-dash/inverted order removed.
- [ ] Inventory-available row shows `name (quantity)` inline; no categoryName sub-label, no "Disponible" block; currency cells preserved.
- [ ] Buckets B/C/D untouched; delivered as commits on the current branch.
