# Tasks: Management → Users Parity (Stage 4 close)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1150-1350 (Unit1 change-password removal ~340 incl. deleting `UserCredentialsForm.tsx` 120 + its 154-line test + service/route test trims; Unit2 offline strip ~60; Unit3 L5 rebuild ~590 — new `user-card-list.tsx`+test ~300 additions, delete `UserList.tsx`+186-line test; Unit4 mask+nav ~120; Unit5 i18n+regression ~60) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (by size); overridden by fixed delivery strategy |
| Suggested split | Unit 1 change-password removal — Unit 2 offline removal — Unit 3 L5 card rebuild — Unit 4 L4 mask+nav — Unit 5 L6 i18n |
| Delivery strategy | single-pr (commits-only, no PR, per user directive) |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Delivery: single branch `feat/frontend-parity-audit`, commits ONLY, NO PR, NO push. `size:exception` pre-accepted per user directive. Work-unit commit boundaries below satisfy reviewability even without PR splitting (mirrors `management-stores-parity` precedent).

### Suggested Work Units (commit boundaries)

| Unit | Goal | Commit type |
|------|------|-------------|
| 1 | Remove admin change-password (`UserCredentialsForm`, orphaned `changePassword`) | refactor |
| 2 | Remove offline cache layer from users list | refactor |
| 3 | L5 card-grid list rebuild (`user-card-list.tsx`, gear menu, `SettingsIcon`) | feat |
| 4 | L4 cell-phone mask, email placeholder, post-save navigation | fix |
| 5 | L6 i18n Empleado/voseo/copy parity + full-suite gates | fix |

## Phase 1: Change-Password Removal (Unit 1) — Req: Edit User Has No Admin Password Change

- [x] 1.1 RED: `user-routes.test.tsx` — remove `mockChangePassword` scaffolding (69,79) and the `S-EDIT-3` describe block (382+)
- [x] 1.2 RED: `user-http-service.test.ts` — remove the `CRED-1` describe block (165+)
- [x] 1.3 GREEN: `user-edit.tsx` — delete `UserCredentialsForm` import/mount (10,143-148), `handlePasswordSubmit` (70-86), `credentials*` state (33-35), the `USERS.CHANGE_PASSWORD` section (136-149)
- [x] 1.4 GREEN: `user-http-service.ts` — delete `changePassword` (72-78) + `ChangePasswordPayload` (21-24)
- [x] 1.5 DELETE `UserCredentialsForm.tsx` + `user-credentials-form.test.tsx` (component now orphaned)
- [x] 1.6 Grep-confirm `profileHttpService.changePassword` untouched; run affected tests green; commit `refactor(web-store-pos): remove admin change-password from management/users`

## Phase 2: Offline Layer Removal (Unit 2) — Req: Users List Is HTTP-Only

- [x] 2.1 RED: `user-routes.test.tsx` (list describe) — assert no `BaseRepository` read/write on mount; no `DEGRADED_NOTICE` at any connectivity state
- [x] 2.2 GREEN: `user-list.tsx` (route) — remove `BaseRepository<User>` import/instance (10,13,30-33,42,60), `isDegraded` state, offline branch in `useEffect` → HTTP-only
- [x] 2.3 GREEN: `UserList.tsx` (component) — drop `isDegraded` prop + `DEGRADED_NOTICE` block (7,18,42-46)
- [x] 2.4 Update `user-list.test.tsx` — remove `isDegraded`/`DEGRADED_NOTICE` cases
- [x] 2.5 Grep users scope for `BaseRepository<User>` → none outside deleted fixtures; run affected tests green; commit `refactor(web-store-pos): remove offline cache layer from management/users list`

## Phase 3: L5 List Rebuild (Unit 3) — Req: Users List Uses Shared Chrome and Deactivated Indicator

- [x] 3.1 RED: new `management/users/components/__tests__/user-card-list.test.tsx` — Card grid renders; FAB (`USERS.CREATE`) triggers `onCreate`; gear menu toggles Editar (always)/Activar (`!isActive`)/Desactivar (`isActive`); deactivated card shows danger indicator
- [x] 3.2 GREEN: add `SettingsIcon` to `shared/components/ui/icons.tsx` (Material `settings` gear svg, same `IconProps` shape as `EditIcon`)
- [x] 3.3 GREEN: create `management/users/components/user-card-list.tsx` — Card grid, per-card gear menu (`useState(openMenuId)`), deactivated `bg-danger/10 border-danger` mirroring `users.component.scss:3-6`
- [x] 3.4 GREEN: `user-list.tsx` (route) — render `UserCardList` instead of `UserList`; wire `Button variant="fab"` + `PlusIcon` for the create trigger (mirrors `admin/stores/routes/store-list.tsx:76-79`)
- [x] 3.5 DELETE `UserList.tsx` + `user-list.test.tsx` (superseded by `user-card-list.tsx`/`.test.tsx`)
- [x] 3.6 Run `user-card-list` + `user-routes` tests green; commit `feat(web-store-pos): rebuild management/users list as card grid with gear menu`

## Phase 4: L4 Form Parity (Unit 4) — Req: Cell-Phone Mask and Field Copy Match Angular; Edit User Navigates to List on Save Success

- [x] 4.1 RED: new `management/users/lib/__tests__/cell-phone-mask.test.ts` — `toDigits` strips non-digits + caps 8; `formatCellPhone` renders `+53 X XXX-XXXX`
- [x] 4.2 GREEN: create `management/users/lib/cell-phone-mask.ts` (`toDigits`, `formatCellPhone`)
- [x] 4.3 RED: `user-create-form.test.tsx` + `user-details-form.test.tsx` — cell-phone input shows mask on typed digits; email input has `placeholder="info@mail.com"`
- [x] 4.4 GREEN: `UserCreateForm.tsx` + `UserDetailsForm.tsx` — controlled masked `cellPhone` input (submit raw digits); email `placeholder="info@mail.com"`
- [x] 4.5 RED: `user-routes.test.tsx` (edit details-success case) — assert `navigate('/management/users')` called; no inline success message remains
- [x] 4.6 GREEN: `user-edit.tsx` — `handleDetailsSubmit` success → `navigate('/management/users')` instead of `setDetailsSuccess(true)`; drop `detailsSuccess` state/UI
- [x] 4.7 Run affected tests green; commit `fix(web-store-pos): users L4 cell-phone mask, email placeholder, post-save navigation`

## Phase 5: L6 i18n + Full-Suite Gates (Unit 5) — Req: Copy Matches Angular Terminology Exactly

- [x] 5.1 RED: `user-routes.test.tsx` / `user-card-list.test.tsx` / form tests — assert titles read "Empleados"/"Adicionar Empleado"/"Editar Empleado"; FAB+submit read "Adicionar"; no voseo strings
- [x] 5.2 GREEN: `es.ts` — `LIST_TITLE`→'Empleados', `CREATE_TITLE`→'Adicionar Empleado', `EDIT_TITLE`→'Editar Empleado', `FULL_NAME`→'Nombre Completo', `LOGIN`→'Usuario', `EMAIL`→'Correo', `CONFIRM_PASSWORD`→'Confirmar Contraseña', `SAVE`/`CREATE`→'Adicionar', `ERROR`/`LIFECYCLE_ERROR` 'Intentá'→'Intente', `OFFLINE_NOTICE` 'Conectate'→'Conéctate', `EMPTY`→'No hay empleados registrados.'; remove `DEGRADED_NOTICE` + dead `OLD_PASSWORD`/`NEW_PASSWORD`/`CONFIRM_NEW_PASSWORD`/`CHANGE_PASSWORD`/`PASSWORD_CHANGED` keys
- [x] 5.3 Verify `USERS.UPDATE` (edit submit label) against `edit-user-details.component.html`; adjust value if mismatched (non-blocking open question from design)
- [x] 5.4 Regression: grep users scope for `BaseRepository<User>`, `Intentá`, `Conectate`, `userHttpService.changePassword` → none; run `pnpm test` full suite green; run `pnpm -C apps/web-store-pos exec tsc --noEmit` clean; commit `fix(web-store-pos): users L6 Empleado terminology, voseo removal, copy parity`
