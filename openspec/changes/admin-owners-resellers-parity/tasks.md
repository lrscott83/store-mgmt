# Tasks: Admin Owners & Resellers Parity (Stage 5 Admin)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550-700 (2 new components + tests, 2 containers rebuilt, i18n edits, 4 test files updated) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (commits-only per delivery constraint — no PR opened) |
| Suggested split | Unit A (Owners) → Unit B (Resellers) → Unit C (sweep) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| A | Owners L5 grid/menu/CSS + L6 text | commit group 1-2 | independent, testable alone |
| B | Resellers L5 grid/menu/CSS + L6 text (incl. 2 overrides) | commit group 3-4 | independent of A |
| C | Regression/i18n sweep | commit group 5 | depends on A+B |

size:exception is PRE-ACCEPTED (user-approved co-slice). Commits-only on `feat/frontend-parity-audit`, no PR/push.

## USER DECISION OVERRIDES (binding — supersede design ADR-5)

1. Reseller **LIST** FAB text = literal Angular `GENERAL.ADD` ("Adicionar"). Fix by changing `RESELLERS.ADD` value from "Agregar revendedor" to "Adicionar" (in-place value change, no key rename, no consumer breakage — sole consumer is `reseller-list.tsx`). "Adicionar Gestor" (`RESELLERS.CREATE_TITLE` / future create-page button) stays only on the **create page**, unaffected.
2. `GENERAL.RESELLER` value "Revendedor" → "Gestor". Confirmed sole consumers: `owner-list.tsx:83`, `owner-create.tsx:216`, `owner-edit.tsx:267` (+ their tests, which read `esMessages['GENERAL.RESELLER']` dynamically — safe). No other module consumes this key. Change value in place.

## Phase 1: Owners L5 — Card Grid, Gear Menu, State CSS (Work Unit A1)

- [x] 1.1 RED: write `app/admin/owners/components/__tests__/owner-card-list.test.tsx` (IntlProvider-wrapped) — asserts: 3-col grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), one `Card` per owner, fullName/store-price ICU/`GENERAL.RESELLER` line/phone/email/description, gear menu closed by default → opens on click → shows **Editar + Eliminar only** (no Aprobar/Activar/Desactivar), `onEdit(id)`/`onDelete(id)` callbacks fire, `bg-danger` when `isActive=false`, `bg-success` when `approved=false`.
- [x] 1.2 GREEN: create `app/admin/owners/components/owner-card-list.tsx` (`OwnerCardList`) — `Card`/`Button`/`SettingsIcon`/`EditIcon`, local `useState(openMenuId)`, `getCardClass(owner)` returning `bg-danger/10 border border-danger` (inactive) / `bg-success/10 border border-success` (unapproved) / `''`.
- [x] 1.3 GREEN: update `app/admin/owners/routes/owner-list.tsx` — delegate rendering to `<OwnerCardList owners onEdit onDelete />`, keep existing `loadOwners`/`handleDelete`/error logic, drop inline div markup and local `getCardClass`.
- [x] 1.4 RED→GREEN: update `app/admin/owners/routes/__tests__/owner-list.test.tsx` — replace div/class assertions with gear-menu + `bg-danger`/`bg-success` assertions; verify no Aprobar/Activar/Desactivar menu items.
- [x] 1.5 Verify: `pnpm test -- owner-card-list owner-list` green.

## Phase 2: Owners L6 — Text/i18n Parity (Work Unit A2)

- [x] 2.1 RED: update `app/admin/owners/routes/__tests__/owner-edit.test.tsx` — submit button asserts `GENERAL.UPDATE` ("Actualizar"), not `USERS.SAVE`.
- [x] 2.2 GREEN: `app/admin/owners/routes/owner-edit.tsx` — repoint submit label `USERS.SAVE`→`GENERAL.UPDATE`; repoint `FULL_NAME/CELL_PHONE/EMAIL/PASSWORD` from `USERS.*`→`GENERAL.*`; `STORES.DESCRIPTION`→`GENERAL.DESCRIPTION`.
- [x] 2.3 RED: update `app/admin/owners/routes/__tests__/owner-create.test.tsx` — title asserts `OWNER.ADD_OWNER` value "Adicionar Propietario"; submit asserts `GENERAL.ADD`; field labels assert `GENERAL.*`.
- [x] 2.4 GREEN: `app/admin/owners/routes/owner-create.tsx` — repoint submit `USERS.SAVE`→`GENERAL.ADD`; fields `USERS.*`→`GENERAL.*`; `STORES.DESCRIPTION`→`GENERAL.DESCRIPTION`.
- [x] 2.5 GREEN: `app/shared/lib/i18n/es.ts` — set `OWNER.CREATE_TITLE`="Adicionar Propietario"; add `GENERAL.FULL_NAME`/`GENERAL.CELL_PHONE`/`GENERAL.EMAIL`/`GENERAL.PASSWORD`/`GENERAL.DESCRIPTION` if not present; set `GENERAL.RESELLER`="Gestor" (**override 2**, confirmed sole consumers above).
- [x] 2.6 GREEN: `app/admin/owners/routes/owner-list.tsx` — repoint delete label `EXPENSES.DELETE`→`GENERAL.DELETE`. (Already satisfied in Phase 1: delete rendering moved into `owner-card-list.tsx`, which uses `GENERAL.DELETE`.)
- [x] 2.7 Verify: `pnpm test -- owner-list owner-edit owner-create` green; confirm `GENERAL.RESELLER` renders "Gestor" in all three routes' tests.

## Phase 3: Resellers L5 — Card Grid, Gear Menu, State CSS (Work Unit B1)

- [ ] 3.1 RED: write `app/admin/resellers/components/__tests__/reseller-card-list.test.tsx` (IntlProvider-wrapped) — 3-col grid, `Card` per reseller with discount/phone/email/description, FAB reads `GENERAL.ADD` ("Adicionar" — **override 1**, not "Adicionar Gestor") and calls `onCreate`, gear menu shows **Editar only** (no Activar/Desactivar/Eliminar), `onEdit(id)` fires, `isActive=false` → `bg-danger`.
- [ ] 3.2 GREEN: create `app/admin/resellers/components/reseller-card-list.tsx` (`ResellerCardList`) — FAB (`Button variant="fab"` + `PlusIcon`) bound to `GENERAL.ADD`, grid of `Card`, gear menu with only Edit (`GENERAL.EDIT`), `cardClass = isActive===false ? 'bg-danger/10 border border-danger' : ''`.
- [ ] 3.3 GREEN: update `app/admin/resellers/routes/reseller-list.tsx` — delegate to `<ResellerCardList resellers onCreate onEdit />`, keep `loadResellers`/error logic, drop inline divs.
- [ ] 3.4 RED→GREEN: update `app/admin/resellers/routes/__tests__/reseller-list.test.tsx` — migrate `.deactive-reSeller` container-query assertions to `bg-danger` on `[data-slot="card"]`; FAB-name lookup resolves to `GENERAL.ADD` value "Adicionar" (**not** "Adicionar Gestor"); title resolves to `RESELLERS.LIST_TITLE`="Gestores"; keep "no activate/deactivate/delete" assertion via gear-menu item count.
- [ ] 3.5 Verify: `pnpm test -- reseller-card-list reseller-list` green.

## Phase 4: Resellers L6 — Text/i18n Parity incl. Overrides (Work Unit B2)

- [ ] 4.1 GREEN: `app/shared/lib/i18n/es.ts` — set `RESELLERS.LIST_TITLE`="Gestores"; set `RESELLERS.CREATE_TITLE`="Adicionar Gestor" (create-page title only, per `RESELLER.ADD_RESELLER`); set `RESELLERS.ADD`="Adicionar" (**override 1** — was "Agregar revendedor", literal Angular `GENERAL.ADD`, in-place value change, no key rename); set `RESELLERS.PERCENT_DISCOUNT`="Porciento de descuento"; set `RESELLERS.DISCOUNT_PRICE`="Descuento".
- [ ] 4.2 RED: update `app/admin/resellers/routes/__tests__/reseller-create.test.tsx` — create title asserts "Adicionar Gestor"; submit asserts `GENERAL.ADD`; field labels assert `GENERAL.*`.
- [ ] 4.3 GREEN: `app/admin/resellers/routes/reseller-create.tsx` — repoint submit `USERS.SAVE`→`GENERAL.ADD`; fields `USERS.*`→`GENERAL.*`; `STORES.DESCRIPTION`→`GENERAL.DESCRIPTION`.
- [ ] 4.4 RED: update `app/admin/resellers/routes/__tests__/reseller-edit.test.tsx` — submit asserts `GENERAL.UPDATE` ("Actualizar"); field labels assert `GENERAL.*`; discount labels assert new values.
- [ ] 4.5 GREEN: `app/admin/resellers/routes/reseller-edit.tsx` — repoint submit `USERS.SAVE`→`GENERAL.UPDATE`; fields `USERS.*`→`GENERAL.*`; `STORES.DESCRIPTION`→`GENERAL.DESCRIPTION`.
- [ ] 4.6 Verify: `pnpm test -- reseller-create reseller-edit` green; confirm reseller LIST FAB text is literally "Adicionar" (not "Adicionar Gestor") and create-page title is "Adicionar Gestor".

## Phase 5: Regression / i18n Sweep (Work Unit C)

- [ ] 5.1 Grep sweep: confirm no remaining `USERS.*`/`EXPENSES.DELETE`/`STORES.DESCRIPTION` references inside `app/admin/owners/**` or `app/admin/resellers/**` (excluding unrelated modules — do not touch `management/users/**`, `expenses/**`, `management/stores/**`).
- [ ] 5.2 Grep sweep: confirm `GENERAL.RESELLER` and `RESELLERS.ADD` have no consumers outside the verified owner/reseller files (re-run the same grep used during planning).
- [ ] 5.3 Type-check: `pnpm -C apps/web-store-pos exec tsc --noEmit` — zero errors.
- [ ] 5.4 Full test run: `pnpm test` (turbo → vitest) — all suites green, including unrelated modules untouched.
- [ ] 5.5 Build validation: `pnpm -C apps/web-store-pos build` — succeeds.
- [ ] 5.6 Final diff review against spec scenarios (owners grid/menu/CSS/text; resellers grid/menu/CSS/text incl. both overrides) before closing the change.

## Commit Plan (work-unit-commits)

1. `feat(web-store-pos): owners admin card grid + gear menu + state CSS` (Phase 1)
2. `fix(web-store-pos): owners admin i18n parity (submit labels, GENERAL.RESELLER=Gestor)` (Phase 2)
3. `feat(web-store-pos): resellers admin card grid + gear menu + state CSS` (Phase 3)
4. `fix(web-store-pos): resellers admin i18n parity (FAB=Adicionar, submit labels, discount copy)` (Phase 4)
5. `chore(web-store-pos): admin owners/resellers parity regression sweep` (Phase 5, if any residual fixes)

Each commit includes its tests. Rollback: revert the single commit without affecting the other unit.
