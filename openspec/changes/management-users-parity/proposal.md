# Proposal: Management → Users Parity (Stage 4 close)

## Intent
Bring React `frontend-react/apps/web-store-pos` Management → Users to 100% parity with Angular `frontend/` (sole source of truth), closing Stage 4 Management after `management-stores-parity`. React drifted: it invented an admin change-password capability and an offline cache Angular never had, uses raw `<table>` chrome, and ships mistranslated/voseo copy calling employees "Usuario" instead of "Empleado". Fix bugs, do not preserve them.

## Scope

### In Scope
- **Remove admin change-password** (LOCKED): drop `UserCredentialsForm` from `user-edit.tsx:136-149` and remove orphaned `userHttpService.changePassword` (`user-http-service.ts:72-78`) + its tests. Angular has NO admin password change — it is Profile self-service only.
- **Remove React-invented offline layer** on users list (`BaseRepository<User>` + degraded banner, `user-list.tsx:10,28-34`) → HTTP-only, matching Angular (Stores precedent).
- **L4**: post-save navigation to list on edit success (Angular `edit-user-details.component.ts:63-67`); cell-phone mask `+53 0 000-0000` (`create-store-user.component.html:83-84`); email placeholder `info@mail.com`; submit gated on form dirty (optional/LOW).
- **L5**: rebuild list with shared Button/Card + FAB + action menu (replace raw table `UserList.tsx:27-109`); restore deactivated-user red/danger card indicator (`users.component.scss:3-6`).
- **L6**: "Empleado" across all 3 titles (list/create/edit); remove voseo ("Conectate"→"Conéctate", "Intentá"→"Intenta"); "Nombre Completo" case; "Correo" not "Email"; align remaining password labels; submit "Adicionar" not "Guardar"; FAB "Adicionar"; "Usuario" not "Usuario (login)".

### Out of Scope
- Management → Configurations (stub) — explicitly deferred.
- Owner / ReSeller / other modules.
- Profile change-password flow (independent, untouched).

## Capabilities

### New Capabilities
- `management-users`: admin Users list + create + edit at strict Angular parity (no admin password change, no offline cache).

### Modified Capabilities
- None.

## Approach
Five work-unit slices matching audit findings: (1) remove admin change-password UI + orphaned service, (2) remove offline layer, (3) L5 list rebuild with shared chrome, (4) L4 mask + post-save nav, (5) L6 i18n corrections. Reuse shared Button/Card/FAB/menu patterns from Expenses/Stores modules. Safety check CONFIRMED during propose: Profile uses its own `profileHttpService.changePassword`; the admin `userHttpService.changePassword` is orphaned — design/apply must re-verify callers before deletion.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `management/users/routes/user-edit.tsx` | Modified | Drop credentials form; add post-save nav |
| `management/users/lib/services/user-http-service.ts` | Removed | Delete orphaned `changePassword` (+tests) |
| `management/users/routes/user-list.tsx` | Modified | Remove offline repo; HTTP-only |
| `management/users/components/UserList.tsx` | Modified | Rebuild table → Card grid + FAB + menu |
| `management/users/components/User*Form.tsx` | Modified | Cell-phone mask, placeholders |
| `app/shared/lib/i18n/es.ts` | Modified | Empleado terminology, voseo removal, labels |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `changePassword` not actually orphaned | Low | Confirmed via grep; design/apply re-verify callers before delete |
| Shared card/menu chrome drifts from Stores/Expenses | Med | Reuse existing shared components, no new primitives |
| List rebuild + i18n exceeds 400-line review budget | Med | tasks phase emits Review Workload Forecast with work-unit commit boundaries |

## Rollback Plan
Each slice is an isolated conventional commit on `feat/frontend-parity-audit`. Revert per-commit; no push, no PR, so rollback is local `git revert`/reset.

## Dependencies
- Shared Button/Card/FAB/menu components (already present from Stores/Expenses).

## Success Criteria
- [ ] Admin user-edit has no change-password surface; orphaned service removed; Profile unaffected.
- [ ] Users list is HTTP-only, no offline banner.
- [ ] List uses shared Card grid + FAB + action menu; deactivated users show red indicator.
- [ ] Edit success navigates to list; cell-phone mask applied.
- [ ] All copy matches Angular exactly ("Empleado", no voseo, correct labels/case); tests green, tsc clean.
