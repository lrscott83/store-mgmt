# Management Users Specification

## Purpose

Admin Management → Users (list, create, edit) in `frontend-react/apps/web-store-pos` at strict parity with Angular `frontend/` (sole source of truth). Scope is Users only; Management → Configurations remains a deferred stub and is explicitly out of scope for this change.

## Requirements

### Requirement: Edit User Has No Admin Password Change
The admin Edit User view MUST NOT expose any password-change UI or capability. Password change MUST remain exclusively a Profile self-service flow, unaffected by this change.

#### Scenario: Admin opens Edit User
- GIVEN an admin navigates to Management → Users → Edit for any employee
- WHEN the edit form renders
- THEN no credentials/password fields or "change password" action are present
- AND `UserCredentialsForm` is not rendered anywhere in the edit route

#### Scenario: Orphaned password service removed
- GIVEN the admin `userHttpService.changePassword` (`user-http-service.ts:72-78`) has no remaining callers after the credentials form is removed
- WHEN the codebase is inspected
- THEN `changePassword` and its dedicated tests no longer exist in `user-http-service.ts`
- AND Profile's `profileHttpService.changePassword` (independent service) is untouched and still functions

### Requirement: Edit User Navigates to List on Save Success
On successful edit save, the system MUST navigate the admin back to the Users list, matching Angular `edit-user-details.component.ts:63-67`.

#### Scenario: Successful save redirects
- GIVEN an admin edits an employee's fields and submits
- WHEN the save request succeeds
- THEN the app navigates to the Users list route
- AND no inline "stay on form" behavior remains

### Requirement: Cell-Phone Mask and Field Copy Match Angular
Create and Edit User forms MUST apply the Angular cell-phone mask (`+53 0 000-0000`) and use Angular's email placeholder text.

#### Scenario: Cell-phone input is masked
- GIVEN an admin types into the cell-phone field on Create or Edit User
- WHEN digits are entered
- THEN the field displays/enforces the `+53 0 000-0000` mask, matching `create-store-user.component.html:83-84`

#### Scenario: Email placeholder matches Angular
- GIVEN an admin views the empty email field on Create or Edit User
- WHEN no value has been entered
- THEN the placeholder text reads `info@mail.com`

### Requirement: Users List Is HTTP-Only
The Users list MUST fetch data directly via HTTP on every load, with no offline/local cache layer, matching Angular `users.component.ts:31-37`.

#### Scenario: List loads via HTTP every time
- GIVEN an admin opens the Users list
- WHEN the component mounts
- THEN it calls the users HTTP service directly
- AND no `BaseRepository<User>` cache, degraded/offline banner, or stale-data indicator exists in `user-list.tsx`

### Requirement: Users List Uses Shared Chrome and Deactivated Indicator
The Users list MUST render using shared Button/Card components with a FAB and action menu (replacing the raw `<table>`), and MUST show a red/danger indicator on deactivated users, matching Angular `users.component.html:1-58` and `users.component.scss:3-6`.

#### Scenario: List renders as card grid with FAB and menu
- GIVEN an admin views the Users list
- WHEN the page renders
- THEN employees display as shared Card items in a grid
- AND a FAB triggers user creation
- AND per-item actions are exposed via a shared action menu (not raw inline buttons)

#### Scenario: Deactivated user shows red indicator
- GIVEN an employee's `isActive` is false
- WHEN their card renders in the list
- THEN the card shows a red/danger visual indicator (not merely a text glyph)

### Requirement: Copy Matches Angular Terminology Exactly
All Users-related copy in `app/shared/lib/i18n/es.ts` MUST match Angular text exactly: "Empleado" terminology, no voseo, and corrected labels/case.

#### Scenario: Page titles use "Empleado"
- GIVEN the Users list, Create, and Edit pages
- WHEN their titles render
- THEN they read "Empleados", "Adicionar Empleado", and "Editar Empleado" respectively (not "Usuario(s)")

#### Scenario: No voseo remains
- GIVEN any Users-related message key (offline notice, error, lifecycle error)
- WHEN the copy is inspected
- THEN no voseo forms ("Conectate", "Intentá") remain — replaced with register-neutral Spanish ("Conéctate", "Intenta")

#### Scenario: Field labels and submit copy match Angular
- GIVEN the Create/Edit User forms
- WHEN labels and buttons render
- THEN "Nombre Completo" (Angular case), "Correo" (not "Email"), "Usuario" (not "Usuario (login)"), and remaining password labels match Angular exactly
- AND the submit button reads "Adicionar" (not "Guardar") and the FAB reads "Adicionar" (not "Crear usuario")

## Out of Scope
- Management → Configurations (stub, deferred).
- Owner / ReSeller / other modules.
- Profile change-password flow (independent, untouched).
