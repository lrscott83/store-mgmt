# Design: Management → Users Parity (Stage 4 close)

## Technical Approach
Strip two React-invented capabilities (admin change-password, list offline cache), then re-skin the list to Angular's mat-card grid and correct i18n. Angular Users mirrors React's 3-route structure already (list/create/edit) — no structural collapse like Stores. Reuse the Stores precedent: delete raw table → shared `Card`/`Button` grid (`user-card-list.tsx` mirroring `store-card-list.tsx`), HTTP-only route, i18n corrections. Unlike Stores, Users' list DOES have per-row actions in a settings-gear menu and NO confirm dialogs (Angular `users.component.ts:43-57` calls services directly).

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Admin change-password | DELETE `UserCredentialsForm`, its section in `user-edit.tsx`, `userHttpService.changePassword` + `ChangePasswordPayload` | Keep as "new capability" | Angular has NO admin password change; grep confirms only caller is `user-edit.tsx:79`. Profile's `profileHttpService.changePassword` is a separate service — untouched. |
| List offline layer | Remove `BaseRepository<User>` + `isDegraded`/`DEGRADED_NOTICE` from `user-list.tsx` → HTTP-only | Keep cache | Angular `users.component.ts:31-37` has none; same invented-offline as Stores. |
| List rebuild | New `user-card-list.tsx` (Card grid + FAB + local action menu), DELETE `UserList.tsx` | Reuse `UserList` table | Angular renders mat-card grid + FAB + mat-menu; strict L5 parity. Mirrors `store-card-list.tsx` naming/structure. |
| Action menu | Component-local `useState(openMenuId)` gear-toggle menu (Editar always; Activar if `!isActive`; Desactivar if `isActive`) | Inline buttons (Stores style); new shared Menu primitive | Angular Users uses a real `mat-menu` (Stores dead-coded lifecycle). Local markup avoids inventing a shared primitive (risk mitigation). |
| Lifecycle confirm | NONE — call service directly then refetch | `confirmDialog` (Stores) | Angular `deleteUser`/`activateUser` have no confirm; Stores confirms were for approve/disapprove only. |
| Cell-phone mask | Shared `cell-phone-mask.ts`: `toDigits` (strip, cap 8) + `formatCellPhone` → `+53 X XXX-XXXX`; controlled input in both forms | ngx-mask lib; per-form logic | No mask lib in React; one helper keeps create+edit identical. Angular stores 8 raw digits (`dropSpecialCharacters`), so submit raw digits. |
| Post-save nav (edit) | `handleDetailsSubmit` success → `navigate('/management/users')` | Inline success message (current) | Angular `edit-user-details.component.ts:63-67` navigates to returnUrl/list. |

## Data Flow
```
/management/users → user-list.tsx (HTTP-only: listUsers) → UserCardList
   card menu: Editar → navigate edit/:id
              Activar/Desactivar → activate/deactivate → refetch (no confirm)
   FAB "Adicionar" → navigate create
/management/users/edit/:id → user-edit.tsx → getUser → UserDetailsForm
   submit → updateUserDetails → navigate('/management/users')   [credentials section GONE]
/management/users/create → UserCreateForm (mask, placeholder) → createUser → list
```

## File Changes

| File | Action | Description |
|---|---|---|
| `management/users/components/user-card-list.tsx` | Create | Card grid + FAB (`GENERAL.ADD`) + gear action menu; deactivated card red (`bg-danger/10 border-danger`) mirroring `deactive-user` |
| `management/users/lib/cell-phone-mask.ts` | Create | `toDigits`/`formatCellPhone` (+53 prefix, `X XXX-XXXX`) |
| `management/users/routes/user-list.tsx` | Modify | Drop `BaseRepository`/`isDegraded`; HTTP-only; render `UserCardList` |
| `management/users/routes/user-edit.tsx` | Modify | Delete credentials section + `handlePasswordSubmit` + credentials state; add post-save `navigate` |
| `management/users/components/UserDetailsForm.tsx` | Modify | Cell-phone mask; email placeholder `info@mail.com` |
| `management/users/components/UserCreateForm.tsx` | Modify | Cell-phone mask; email placeholder; submit `USERS.SAVE`; optional pristine gating (LOW) |
| `management/users/lib/services/user-http-service.ts` | Modify | Remove `changePassword` + `ChangePasswordPayload` |
| `management/users/components/UserList.tsx` | Delete | Replaced by `user-card-list.tsx` |
| `management/users/components/UserCredentialsForm.tsx` | Delete | Admin change-password removed |
| `shared/components/ui/icons.tsx` | Modify | Add `SettingsIcon` (Material `settings` gear) for menu trigger |
| `shared/lib/i18n/es.ts` | Modify | L6 keys (below) |

## i18n (es.ts) — Angular source values
`USERS.LIST_TITLE` `'Usuarios'`→`'Empleados'`; `CREATE_TITLE` `'Nuevo usuario'`→`'Adicionar Empleado'`; `EDIT_TITLE` `'Editar usuario'`→`'Editar Empleado'`; `FULL_NAME` `'Nombre completo'`→`'Nombre Completo'`; `LOGIN` `'Usuario (login)'`→`'Usuario'`; `EMAIL` `'Email'`→`'Correo'`; `CONFIRM_PASSWORD` `'Confirmar contraseña'`→`'Confirmar Contraseña'`; `SAVE` `'Guardar'`→`'Adicionar'` (`GENERAL.INSERT`); `CREATE` `'Crear usuario'`→`'Adicionar'` (`GENERAL.ADD`, FAB); `ERROR`/`LIFECYCLE_ERROR` voseo `'Intentá'`→`'Intente'`; `OFFLINE_NOTICE` `'Conectate'`→`'Conéctate'`; `EMPTY`→`'No hay empleados registrados.'`. REMOVE `DEGRADED_NOTICE`. REMOVE dead keys `OLD_PASSWORD`/`NEW_PASSWORD`/`CONFIRM_NEW_PASSWORD`/`CHANGE_PASSWORD`/`PASSWORD_CHANGED` (only used by deleted credentials surface). Verify `USERS.UPDATE` (edit submit) against `edit-user-details.component.html` during apply.

## Testing Strategy (Strict TDD — vitest)
| Layer | What | How |
|---|---|---|
| Service | `changePassword` removed | Delete `user-http-service.test.ts:165+` (CRED-1) |
| Route (edit) | no credentials form; post-save nav | Remove `user-routes.test.tsx:79,382+` (mockChangePassword, S-EDIT-3); assert `navigate('/management/users')` on details success |
| Route (list) | HTTP-only, no cache/banner | Update list tests: no `BaseRepository`, no `DEGRADED_NOTICE` |
| Component | card grid renders; gear menu → Editar/Activar/Desactivar; deactivated red; FAB | New `user-card-list.test.tsx` |
| Util | mask format/parse | New `cell-phone-mask.test.ts` |
| Regression | grep no `BaseRepository<User>`, no voseo in users scope, no `userHttpService.changePassword` | grep asserts |

## Migration / Rollout
No data migration. `BaseRepository<User>` deletion safe (only caller = `user-list.tsx`, grep-verified). Work-unit commits on `feat/frontend-parity-audit`: (1) remove change-password, (2) remove list offline, (3) L5 card rebuild, (4) L4 mask + nav, (5) L6 i18n. No push/PR.

## Open Questions
None blocking. `USERS.UPDATE` (edit submit label) to be confirmed against `edit-user-details.component.html` during apply — non-blocking.
