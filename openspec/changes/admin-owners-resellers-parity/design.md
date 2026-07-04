# Design — admin-owners-resellers-parity (Stage 5 Admin)

Technical approach for co-slicing `admin/owners` + `admin/resellers` list views to strict
Angular parity in React `web-store-pos`. Reads: proposal (engram #588), audit (engram #587).

Source of truth (Angular):
- `frontend/src/app/presentation/owners/owners.component.{html,scss,ts}`
- `frontend/src/app/presentation/resellers/resellers.component.{html,scss,ts}`
- i18n: `frontend/src/app/_modules/i18n/vocabs/es.ts`

Target (React):
- `frontend-react/apps/web-store-pos/app/admin/{owners,resellers}/routes/*.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`

---

## 1. Architecture approach

**Reuse the established card-grid + gear-menu pattern; do NOT invent primitives.**

The prior stages `management-users-parity` and `admin-stores-parity` (management-stores)
already built the shared vocabulary for a Material `mat-card` 3-column grid with a per-card
gear (`mat-menu`) action affordance. This change is a **third instance of the same pattern**,
not a new one. Concretely, we reuse:

| Concern | Reused primitive | Path |
|---|---|---|
| Card chrome (`.card`, header, body) | `Card` (`data-slot="card"`) | `app/shared/components/ui/card.tsx` |
| Buttons / FAB | `Button` (`variant="fab" \| "outline"`) | `app/shared/components/ui/button.tsx` |
| Gear / edit icons | `SettingsIcon`, `EditIcon`, `PlusIcon` | `app/shared/components/ui/icons.tsx` |
| Gear-menu open/close | component-local `useState(openMenuId)` toggle | precedent: `user-card-list.tsx:29-48` |
| 3-col responsive grid | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` | precedent: `user-card-list.tsx:62`, `store-card-list.tsx:33` |

**Boundary / layering.** Follow the container-presentational split already used for Users:
the route (`*-list.tsx`) is the container (loader, HTTP, state, error, navigation handlers);
a new presentational component receives data + callbacks and renders the grid. This keeps the
gear-menu interaction testable in isolation (mirrors `user-card-list.test.tsx`).

New presentational components (mirroring `UserCardList` / `StoreCardList`):
- `app/admin/owners/components/owner-card-list.tsx` → `OwnerCardList`
- `app/admin/resellers/components/reseller-card-list.tsx` → `ResellerCardList`

---

## 2. Component & data flow

### 2.1 Owners

**Angular reference** (`owners.component.html`):
- No FAB — the add button is commented out (`owners.component.html:8-11`). **React keeps NO
  FAB on the owner list** (bug-for-bug parity; `owner-create` remains reachable by direct URL,
  matching Angular). This is unchanged from current React behavior.
- Card header: `fullName` + gear button (`SettingsIcon`) opening a menu.
- Menu items (`owners.component.html:31-59`): Edit (routerLink, LIVE) / Approve
  (`isActive && guest`, `approveOwner` = **empty no-op stub** ts:353) / Deactivate (`isActive`,
  `deactivateOwner` = **empty stub** ts:349) / Activate (`!isActive`, `activateOwner` = **empty
  stub** ts:345) / Delete (`deleteOwner` = LIVE ts:337, no confirm dialog).
- Card body: `getOwnerStorePrice(owner)` currency + store-count text, `GENERAL.RESELLER: {name|ADMIN}`,
  `cellPhone`, `email?`, `description`.

**React `OwnerCardList` design:**
- Props: `{ owners: Owner[]; onEdit(id); onDelete(id) }`.
- Grid of `Card` per owner, `title={owner.fullName}`, `className={getCardClass(owner)}`.
- Body: store price + `OWNER.STORE_PRICE_LABEL` ICU plural (KEEP React's ICU — Angular's
  `getOwnerStoreCountText` is singular-only bug, ts:365-370; proposal keeps React-correct),
  reseller line, phone, email, description.
- Gear menu (only LIVE actions): **Edit** → `onEdit`, **Delete** → `onDelete`. Approve /
  Activate / Deactivate are excluded (no-op stubs — see ADR-2).
- Delete has no confirm dialog (Angular `deleteOwner` calls the service directly — parity).

Container `owner-list.tsx` keeps its existing `loadOwners` / `handleDelete` / error logic;
it stops rendering inline divs and delegates to `<OwnerCardList owners onEdit onDelete />`.

### 2.2 Resellers

**Angular reference** (`resellers.component.html`):
- FAB present (`resellers.component.html:7-10`) → `openCreateReSellerModal()` → navigates
  `/admin/resellers/create`. React keeps a FAB.
- Menu items (`resellers.component.html:30-55`): Edit (routerLink, LIVE) / Deactivate
  (`isActive`, `deactivateReSeller` = **empty stub** ts:55) / Activate (`!isActive`,
  `activateReSeller` = **empty stub** ts:51) / Delete (`deleteReSeller` = **empty stub** ts:47).
- **Only Edit is a live action.** All lifecycle + delete are no-op stubs → excluded (ADR-2).
- Card body: `GENERAL.PERCENT_DISCOUNT_PRICE`, `GENERAL.DISCOUNT_PRICE`, phone, email, description.

**React `ResellerCardList` design:**
- Props: `{ resellers: ReSeller[]; onCreate(); onEdit(id) }`.
- FAB (`Button variant="fab"` + `PlusIcon`) above the grid → `onCreate`.
- Grid of `Card` per reseller, `title={reseller.fullName}`, `className={getCardClass(reseller)}`.
- Gear menu with **Edit only** (see ADR-3 — the gear affordance is preserved for visual parity,
  but the menu holds only the one live action).

Container `reseller-list.tsx` keeps `loadResellers` / error logic; delegates to
`<ResellerCardList resellers onCreate onEdit />`.

### 2.3 State indicator mapping — `getCardClass` (ADR-1)

Angular applies state via SCSS background classes on `mat-card`:
- `getOwnerBackgroundColor` (ts:357): `!isActive → deactive-owner (danger)` else
  `!approved → guest-owner (success)` else `''`.
- `getReSellerBackgroundColor` (ts:63): `!isActive → deactive-reSeller (danger)` else `''`.
- SCSS colors: `guest-owner=$success` (green), `deactive-owner=$danger` (red),
  `deactive-reSeller=$danger` (red). (`outdated-owner`/`guest-reSeller` are dead — never
  returned by the getters.)

**This codebase has NO card SCSS modules** — the established convention (`user-card-list.tsx:67`)
maps state → Tailwind token utilities inline (`bg-danger/10 border border-danger`). We follow
that convention. Design tokens exist: `--color-success`, `--color-danger`
(`packages/web-common/styles.css:16-17`).

`getCardClass` returns Tailwind utility strings, not semantic class names:

```ts
// owners
function getCardClass(o: Owner): string {
  if (!o.isActive) return 'bg-danger/10 border border-danger';   // deactive-owner
  if (!o.approved) return 'bg-success/10 border border-success'; // guest-owner (green in Angular)
  return '';
}
// resellers
const cardClass = reseller.isActive === false ? 'bg-danger/10 border border-danger' : '';
```

Consequence: the `.deactive-owner` / `.guest-owner` / `.deactive-reSeller` semantic class
names are **not** ported. The existing `reseller-list.test.tsx` assertions on
`.deactive-reSeller` must migrate to `bg-danger` (see §4).

---

## 3. i18n plan (grep-before-touch)

### 3.1 Value changes (Angular wins — from proposal §Scope)

| Key | Current React | New value | Angular source |
|---|---|---|---|
| `RESELLERS.LIST_TITLE` | `Revendedores` | `Gestores` | `MENU.RESELLERS` |
| `RESELLERS.CREATE_TITLE` | `Nuevo revendedor` | `Adicionar Gestor` | `RESELLER.ADD_RESELLER` |
| `RESELLERS.ADD` | `Agregar revendedor` | `Adicionar Gestor` | see ADR-5 |
| `RESELLERS.PERCENT_DISCOUNT` | `Descuento porcentual` | `Porciento de descuento` | `GENERAL.PERCENT_DISCOUNT_PRICE` |
| `RESELLERS.DISCOUNT_PRICE` | `Precio con descuento` | `Descuento` | `GENERAL.DISCOUNT_PRICE` |
| `OWNER.CREATE_TITLE` | `Nuevo propietario` | `Adicionar Propietario` | `OWNER.ADD_OWNER` |

Values are changed **in place** on the existing `RESELLERS.*` / `OWNER.*` keys (no key
rename) — cheapest, no consumer breakage.

### 3.2 Cross-namespace key retirement (hygiene — proposal Scope IN)

Owner/reseller routes borrow keys owned by other modules. **Grep-before-touch: these source
keys MUST NOT be deleted** — other modules consume them (verified):
- `EXPENSES.DELETE` → consumed by `expenses/components/expense-list.tsx`, `today-expenses.tsx`.
- `STORES.DESCRIPTION` → consumed by `management/stores/components/store-form.tsx`.
- `USERS.SAVE / USERS.EDIT / USERS.FULL_NAME / USERS.CELL_PHONE / USERS.EMAIL / USERS.PASSWORD`
  → consumed across `management/users/**`.

Fix = **stop borrowing in owner/reseller files**, point them at correctly-scoped keys.
Add reusable generic field labels to the `GENERAL.*` namespace (DRY across owner+reseller):

| Add to GENERAL | Value |
|---|---|
| `GENERAL.FULL_NAME` | `Nombre Completo` |
| `GENERAL.CELL_PHONE` | `Teléfono` |
| `GENERAL.EMAIL` | `Correo` |
| `GENERAL.PASSWORD` | `Contraseña` |
| `GENERAL.DESCRIPTION` | `Descripción` |
| `GENERAL.PERCENT_DISCOUNT_PRICE` | `Porciento de descuento` |
| `GENERAL.DISCOUNT_PRICE` | `Descuento` |

(`GENERAL.ADD='Adicionar'`, `GENERAL.EDIT='Editar'`, `GENERAL.DELETE='Eliminar'`,
`GENERAL.UPDATE='Actualizar'`, `GENERAL.INSERT='Adicionar'` already exist.)

Repointing map in owner/reseller route files:

| File / line | From | To |
|---|---|---|
| `owner-list` delete | `EXPENSES.DELETE` | `GENERAL.DELETE` |
| `owner-list` edit menu | `OWNER.EDIT_OWNER` (keep) | `OWNER.EDIT_OWNER` |
| `reseller-list` edit menu | `USERS.EDIT` | `GENERAL.EDIT` (Angular reseller menu uses `GENERAL.EDIT`) |
| `owner-edit:290`, `reseller-edit:280` submit | `USERS.SAVE` | `GENERAL.UPDATE` (`Actualizar` — edit) |
| `owner-create:239`, `reseller-create:198` submit | `USERS.SAVE` | `GENERAL.ADD` (`Adicionar` — create) |
| all 4 forms `FULL_NAME/CELL_PHONE/EMAIL/PASSWORD` | `USERS.*` | `GENERAL.*` |
| all 4 forms `STORES.DESCRIPTION` | `STORES.DESCRIPTION` | `GENERAL.DESCRIPTION` |
| `reseller-edit` discount labels | `RESELLERS.PERCENT_DISCOUNT`/`RESELLERS.DISCOUNT_PRICE` | keep (values fixed in §3.1) |

### 3.3 Submit-button parity (ADR-4)

Angular renders submit dynamically (`INSERT` on create, `UPDATE` on edit). React edit and
create are separate routes, so we hardcode per-route: **edit → `GENERAL.UPDATE` (`Actualizar`)**,
**create → `GENERAL.ADD` (`Adicionar`)**. This fixes the current bug where edit shows
`Adicionar`.

---

## 4. Test strategy (Strict TDD — vitest + @testing-library/react)

All component/route tests wrap render in `IntlProvider` with `esMessages`
(`user-card-list.test.tsx:18-24` precedent). Write/adjust tests FIRST (red), then implement.

**New — `owner-card-list.test.tsx`** (mirror `user-card-list.test.tsx`):
- renders a `Card` per owner (`[data-slot="card"]`), shows fullName / phone / email / description.
- store-price line renders ICU plural (`1 tienda` vs `2 tiendas`).
- gear menu closed by default; opens on gear click; shows **Editar + Eliminar only**; NO
  Aprobar/Activar/Desactivar menuitems (Req: no-op stubs excluded).
- Edit → `onEdit(id)`; Delete → `onDelete(id)` (no confirm).
- deactivated owner (`isActive=false`) → card className contains `bg-danger`; guest owner
  (`approved=false, isActive=true`) → `bg-success`; active+approved → neither.

**New — `reseller-card-list.test.tsx`:**
- renders `Card` per reseller with discount/phone/email/description fields.
- FAB reads `Adicionar Gestor` (Req: copy) and calls `onCreate`.
- gear menu shows **Editar only**; NO Activar/Desactivar/Eliminar menuitems.
- Edit → `onEdit(id)`; `isActive=false` → `bg-danger` indicator.

**Update — `reseller-list.test.tsx`:**
- migrate the two `.deactive-reSeller` container queries to assert `bg-danger` on
  `[data-slot="card"]` (className contains), matching the Tailwind approach (ADR-1).
- FAB-name lookups now resolve to `Adicionar Gestor`; LIST_TITLE now `Gestores`.
- existing "no activate/deactivate/delete buttons" test still holds (now enforced via the menu).

**Update — `owner-list.test.tsx`** (if present): title unchanged (`Propietarios`); delete label
now `Eliminar` via `GENERAL.DELETE`; add gear-menu assertions; add `bg-danger`/`bg-success`
indicator assertions.

**Update — `owner-edit`/`reseller-edit` route tests:** submit button now reads `Actualizar`.
**Update — `owner-create`/`reseller-create` route tests:** field labels resolve via `GENERAL.*`;
submit reads `Adicionar`.

i18n changes are covered indirectly by `esMessages` lookups in the above; no separate snapshot.

---

## 5. Build / dependency notes

**No `@store-mgmt/domain` rebuild required.** `getCardClass` reads only existing fields —
`Owner.{isActive, approved, storeModules}` and `ReSeller.isActive` are already exported and
consumed today (`owner-list.tsx:11-15`, `reseller-list.tsx:55`). No domain model/export change,
so no `packages/domain` rebuild step. If a later task DID touch a domain export, the domain
package would need rebuilding before app tests resolve the new type — not the case here.

---

## ADRs

**ADR-1 — Map state to Tailwind tokens, do not port Angular SCSS class names.**
Decision: `getCardClass` returns `bg-danger/10 border border-danger` (deactive) /
`bg-success/10 border border-success` (guest owner). Rejected: adding global CSS for
`.deactive-owner`/`.guest-owner`/`.deactive-reSeller`. Rationale: the codebase has no card SCSS
modules; `UserCardList` already established Tailwind-token indicators. Porting semantic class
names would introduce a one-off styling mechanism inconsistent with every other card. Cost:
the existing `.deactive-reSeller` test assertions must migrate to `bg-danger`.

**ADR-2 — Exclude Angular no-op action stubs from the gear menu.**
Decision: owners menu = Edit + Delete; resellers menu = Edit only. Rejected: reproducing
Approve/Activate/Deactivate (owners) and Activate/Deactivate/Delete (resellers). Rationale:
those Angular handlers are empty method bodies (`owners.component.ts:345-355`,
`resellers.component.ts:47-61`) — rendering them would ship dead buttons. Proposal mandates
"do NOT build for Angular dead code." Real reseller lifecycle lives in the edit form
(`isActive` toggle), already at parity.

**ADR-3 — Reseller gear menu with a single Edit item.**
Decision: keep the gear affordance (`SettingsIcon` + menu) for card-header visual parity with
Angular, even though only Edit is live. Rejected: replacing the gear with a bare Edit icon
button. Rationale: preserves the visual grammar of the grid (every card has a gear) shared with
owners/users/stores; the alternative would make resellers structurally divergent for no gain.

**ADR-4 — Hardcode submit label per route instead of dynamic detection.**
Decision: edit routes → `GENERAL.UPDATE`, create routes → `GENERAL.ADD`. Rejected: an
`isEdit` flag mirroring Angular's dynamic `INSERT/UPDATE`. Rationale: React splits create/edit
into separate route files, so the mode is statically known — a runtime flag adds indirection
with no benefit.

**ADR-5 — Reseller list FAB reads `Adicionar Gestor`, not literal Angular `Adicionar`.**
Evidence: the Angular reseller LIST FAB actually renders `GENERAL.ADD='Adicionar'`
(`resellers.component.html:9`); `RESELLER.ADD_RESELLER='Adicionar Gestor'` is used on the create
PAGE, not the list. Decision: follow the proposal and use `Adicionar Gestor` for terminology
consistency with the `Gestores` list title (a deliberate React-consistency improvement over
Angular's generic string). Recorded so verify/tasks can reconcile if strict-literal parity is
preferred. Risk noted below.

---

## Risks / open items

- **ADR-5 discrepancy** — proposal cites `RESELLER.ADD_RESELLER` for the list FAB, but Angular's
  list FAB literally uses `GENERAL.ADD`. Design honors the proposal (`Adicionar Gestor`). If
  verify insists on strict-literal parity, the FAB should read `Adicionar`.
- **`GENERAL.RESELLER` value** — owner card shows `GENERAL.RESELLER='Revendedor'`; Angular
  `GENERAL.RESELLER='Gestor'`. NOT in proposal scope (audit did not flag it for owners). Left
  unchanged to avoid scope creep, but it is an inconsistency (`Gestores` title vs `Revendedor`
  label). Flag for a follow-up.
- **Owner list has no FAB** (Angular add button commented out) → `owner-create` reachable only
  by direct URL. Bug-for-bug parity; not a regression vs current React. Confirm acceptable.
- **New GENERAL field-label keys** duplicate values already in `USERS.*`. Acceptable DRY tradeoff
  (generic labels belong in GENERAL); USERS.* stay for the users module.
- Combined 2-submodule L5 rebuild + i18n exceeds 400 lines — `size:exception` pre-accepted
  (proposal). Commits-only on `feat/frontend-parity-audit`, no PR/push.
