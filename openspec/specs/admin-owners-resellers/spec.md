# Admin Owners & Resellers Parity Specification

## Purpose

Bring React `admin/owners` and `admin/resellers` list views (web-store-pos) to strict structural and textual parity with Angular (`frontend/`), the sole source of truth. Restores the 3-col mat-card grid, gear-menu action pattern, unstyled state CSS classes, and Spanish copy drift. No new functionality; no Angular dead code or no-op stubs are built.

## Requirements — Owners (admin/owners)

### Requirement: Owners List Card Grid

The owners list MUST render a 3-column responsive card grid per Angular `row row-cols-1 row-cols-md-3` (owners.component.html:15).

#### Scenario: Desktop grid
- GIVEN an admin views `/admin/owners` at desktop width
- WHEN the list loads
- THEN owner cards render 3-per-row, one card per owner

### Requirement: Owners Gear Menu — Live Actions Only

Each owner card MUST expose a gear-icon menu with ONLY Edit and Delete, matching Angular's two real handlers — `deleteOwner` calls the API (owners.component.ts:337-343); `approveOwner`/`activateOwner`/`deactivateOwner` are empty stubs (owners.component.ts:345-355) and MUST NOT be built.

#### Scenario: Menu shows Edit and Delete only
- GIVEN an owner card
- WHEN the admin opens the gear menu
- THEN exactly Edit (→ `/admin/owners/edit/:id`) and Delete are shown
- AND no Approve/Activate/Deactivate items exist

#### Scenario: Delete removes the owner
- GIVEN the gear menu is open
- WHEN the admin confirms Delete
- THEN the owner is deleted and the list reloads

### Requirement: Owners State CSS Classes

The list MUST style `.guest-owner` and `.deactive-owner`, matching `getOwnerBackgroundColor` (owners.component.ts:357-359; owners.component.scss:3-16).

#### Scenario: Unapproved and inactive owners are visually flagged
- GIVEN an owner with `approved=false, isActive=true`
- WHEN the card renders
- THEN it applies the `.guest-owner` style
- GIVEN an owner with `isActive=false`, THEN it applies `.deactive-owner` instead

### Requirement: Owners L6 Text Parity

Owner copy MUST match Angular literally for known mismatches.

#### Scenario: Edit submit reads "Actualizar"; create title reads Angular's
- GIVEN an admin edits an existing owner
- WHEN the form renders
- THEN the submit button reads "Actualizar" (GENERAL.UPDATE), not "Adicionar"
- AND the create-owner page title reads "Adicionar Propietario" (OWNER.CREATE_TITLE)

## Requirements — Resellers (admin/resellers)

### Requirement: Resellers List Card Grid

The resellers list MUST render a 3-column responsive card grid per Angular `row row-cols-1 row-cols-md-3` (resellers.component.html:14).

#### Scenario: Desktop grid
- GIVEN an admin views `/admin/resellers` at desktop width
- WHEN the list loads
- THEN reseller cards render 3-per-row

### Requirement: Resellers Gear Menu — Edit Only

Each reseller card MUST expose a gear menu with ONLY Edit, since Angular's Activate/Deactivate/Delete reseller handlers are empty stubs (resellers.component.ts:47-61) and MUST NOT be built.

#### Scenario: Menu shows Edit only
- GIVEN a reseller card
- WHEN the admin opens the gear menu
- THEN exactly one item, Edit (→ `/admin/resellers/edit/:id`), is shown
- AND no Activate/Deactivate/Delete items exist

### Requirement: Resellers State CSS Class

The list MUST style `.deactive-reSeller`, matching `getReSellerBackgroundColor` (resellers.component.ts:63-65; resellers.component.scss:8-11).

#### Scenario: Inactive reseller is visually flagged
- GIVEN a reseller with `isActive=false`
- WHEN the card renders
- THEN it applies the `.deactive-reSeller` style

### Requirement: Resellers L6 Text Parity

Reseller copy MUST match Angular literally for all 6 known mismatches.

#### Scenario: List/add/discount labels match Angular
- GIVEN an admin views `/admin/resellers`
- WHEN the page renders
- THEN the list title reads "Gestores" (RESELLERS.LIST_TITLE) and the list FAB action reads "Adicionar" (RESELLERS.ADD); the create-page title separately reads "Adicionar Gestor" (RESELLERS.CREATE_TITLE)
- AND discount labels read "Porciento de descuento" / "Descuento" (RESELLERS.PERCENT_DISCOUNT / RESELLERS.DISCOUNT_PRICE)

#### Scenario: Edit submit is dynamic
- GIVEN an admin edits an existing reseller
- WHEN the form renders
- THEN the submit button reads "Actualizar" (GENERAL.UPDATE); on create it reads "Adicionar" (GENERAL.ADD)

## Non-Requirements (Explicit Exclusions)

- MUST NOT implement Angular's no-op stub actions: owner Approve/Activate/Deactivate; reseller Activate/Deactivate/Delete. These stay absent from gear menus.
- MUST NOT modify admin/stores, admin/features, admin/dashboard, or admin/roles (dead route).
- MUST NOT build Angular dead code (e.g., `OwnerDetailsComponent`).
