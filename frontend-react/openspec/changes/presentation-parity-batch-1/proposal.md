# Proposal: Presentation Parity Batch 1

## Intent

An adversarial code-only presentation-layer parity audit (Angular `frontend/src/app/presentation/` vs React `frontend-react/apps/web-store-pos/app/`) found many divergences. The user selected 10 fixes to make React match Angular now. Migration parity only — invent nothing, code-only verdict. Everything else is intentionally deferred or kept as an enhancement.

## Scope

### In Scope — 10 parity fixes (grouped by area)

**Sales**
- **[3 — LARGE]** `sales/edit-products-modal.tsx`: reworks from editing existing prices (`updateProduct`) to bulk-CREATE like Angular — blank Nombre+Precio rows, "+ Nuevo" add-row, required/duplicate-name validation, `createProducts(categoryId, newProducts)`. Verify `createProducts` exists on React product service; flag if absent.

**Inventory**
- **[5]** `available.tsx`: show `INVENTORY.NO_ENTRY_FOUND` when `categories.length === 0`; keep per-category message only for an empty category.
- **[8]** `inventory/edit-inventory-entry-modal.tsx:143`: product `<select>` disabled unconditionally (Angular `[disabled]="true"`).

**Expenses**
- **[6]** `expenses/expense-form-modal.tsx:71`: create-mode default type → `ExpenseType.Salario` (not `Otro`).
- **[7]** same file `:72,91`: Total starts empty/undefined and is invalid until entered (Angular `Validators.required`; today `total:0` passes `>=0`).

**Admin / Statistics / Features**
- **[1]** `admin/stores/store-card-list.tsx:24`: not-approved → `bg-warning/10 border-warning` (amber), not success/green. Deactivated stays danger/red (verify).
- **[2 — LARGE]** `statistics/routes/dashboard.tsx`: ADD currency selector (wire ported-but-unused `currency-service.ts`), 4 KPI cards (Ventas/Gastos[hasExpensesModule]/Créditos[hasCreditsModule]/Ganancias with trend logic), and 2 top-products lists (top-profit, top-sale-quantity, 30d). KEEP the existing recharts charts (chart→table revert NOT selected).
- **[9]** `admin/features/routes/features.tsx:40`: gear icon → EditIcon (pencil); replace static `<p>` feedback with `showBlockingSuccess`/`showBlockingError` (`shared/lib/blocking-alert.ts`).

**Profile**
- **[4]** `profile/edit-profile-form.tsx:92`: cellPhone masked (`+53 0 000-0000`) + required, reusing `formatCellPhone`/`toDigits` from `management/users/lib/cell-phone-mask`.

**Auth**
- **[10 — LARGE]** `auth/components/auth-layout.tsx`: port guest-footer (Cookies/Privacy/Terms/Contact legal links + copyright). `auth/routes/register.tsx`: remove invented interim `REGISTRATION.SUCCESS_REDIRECT` screen; navigate straight to /login. Do NOT add password eye-toggle (Bucket C, deferred).

### Out of Scope (user's explicit choice — do not touch)
Category ⚙️ gear menu (keep), Reports invented dashboard (keep), Statistics charts→tables revert (keep charts), Tutorial 4→1 panels (keep), the whole Bucket-C fab/password/Cerrar/modal-icon sweep, all Bucket-D enhancements, all Bucket-E cosmetics.

## Capabilities

### New Capabilities
- `presentation-parity-batch-1`: the 10 selected presentation-layer parity fixes above.

### Modified Capabilities
- None (spec behavior is Angular parity; captured under the new capability).

## Approach

10 independent parity fixes, each a TDD work unit (RED→GREEN). 7 are small/localized; 3 are larger (statistics dashboard, nuevo-productos rework, auth footer+register). Each fix mirrors the exact Angular source component — no invented behavior.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Statistics dashboard is largest (selector + KPIs + top lists + gating/trend) | High | Isolate as its own slice; keep recharts untouched; wire existing currency-service |
| Nuevo-productos flips create-vs-update semantics | Med | TDD on createProducts path; verify `createProducts` exists first, flag if not |
| Missing service method blocks fix #3 | Low | Pre-check service surface before apply |
| Each fix must be strict TDD | Med | `pnpm test` RED before GREEN per work unit |

## Rollback Plan

Commits-only per work unit on `feat/presentation-parity-batch-1`. Revert any individual fix's commit(s) independently; no PR, no schema/data changes.

## Dependencies

- `currency-service.ts` (already ported), `cell-phone-mask`, `blocking-alert.ts`, product service `createProducts` (verify).

## Success Criteria

- [ ] All 10 fixes match Angular source (code-only parity).
- [ ] Each fix has failing-first tests, then green; `pnpm test` passes.
- [ ] recharts charts retained on statistics; out-of-scope items untouched.
- [ ] Commits-only on `feat/presentation-parity-batch-1`, no PR.
