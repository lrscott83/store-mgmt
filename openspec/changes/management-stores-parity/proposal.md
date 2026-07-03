# Proposal: Management → Stores Parity (Stage 4)

## Intent

Stage 4 of frontend-parity-audit. Angular (`frontend/`) is the ONLY source of truth; React (`frontend-react/apps/web-store-pos/`) must reach 100% parity. React's `management/stores` structurally diverged: it invented a list+lifecycle table where Angular renders a single edit form, and merged the super-admin `admin/stores` grid into the everyday flow. This change collapses React back to Angular's model and closes L4/L5/L6 gaps for the Stores flow.

## Scope

### In Scope (Management → Stores only)
- **Structural collapse**: `/management/stores`, `/management/stores/create`, `/management/stores/edit/:id` all render the store EDIT form directly (id from route param `|| user.selectedStoreId`), with title-switching like Angular `getHeader()`. No list table.
- **Remove** from `management/stores`: the list table (`store-list.tsx`), the React-invented offline cache layer (`BaseRepository<Store>` + degraded-cache banner — Angular Management is pure HTTP/online-only), loose lifecycle buttons (Activate/Deactivate/Approve/Disapprove).
- **`/admin/stores`** (super-admin only) stays the SOLE lifecycle list. There: RESTORE confirmation dialogs before Approve/Disapprove (Angular SweetAlert2); HIDE Activate/Deactivate (Angular dead-codes them).
- **L5**: adopt shared Button/Card/InfoBox + icons + card/FAB chrome across the stores flow.
- **L6**: fix Spanish — titles "Crear una tienda"/"Editar la tienda"; "Aceptado" (not "Aprobada"); "Aceptar" (not "Aprobar"); "Activo" (not "Activa"); drop voseo ("Intentá"/"Conectate" → neutral); remove hardcoded strings.
- **L4**: field-name-aware required-validation messages matching Angular.

### Out of Scope (deferred follow-ups)
- Management → Users (terminology "Empleado" vs "usuario", "Nombre completo" case).
- Management → Configurations (stub).
- Owner / ReSeller / any other module.

## Design defaults (baked in — do not re-open)
- **Do NOT** replicate Angular's `isActive` template bug (shows toggle for `isOwnerAdmin` but only wires it for `isSuperAdmin`). React's strict `isSuperAdmin` gating is correct — fix-bugs-not-preserve.
- **Keep** React's soft `getMe()`+`updateUser` refresh instead of Angular's `document.location.reload()` — functionally equivalent, better UX.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `management-stores`: route model collapses list→edit-form; offline cache removed; lifecycle actions leave this route.
- `admin-stores`: Approve/Disapprove gain confirm dialogs; Activate/Deactivate hidden.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/routes.ts` (64-66) | Modified | All three `management/stores*` routes → single edit form |
| `app/management/stores/routes/store-list.tsx` | Removed | List table has no Angular equivalent for this audience |
| `app/management/stores/routes/store-create.tsx`, `store-edit.tsx` | Modified | Converge on shared edit form + title switch |
| `app/management/stores/components/store-list.tsx` | Removed | Table + lifecycle buttons |
| `app/management/stores/**` cache | Removed | `BaseRepository<Store>` + degraded banner; back to HTTP |
| `app/admin/stores/routes/store-list.tsx` | Modified | Restore confirm dialogs; hide Activate/Deactivate |
| `app/management/stores/components/store-form.tsx` | Modified | L5 chrome + L4 validation messages |
| `app/shared/lib/i18n/es.ts` | Modified | L6 title/status/voseo fixes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing offline cache breaks callers assuming local reads | Medium | Confirm Management is HTTP-only per Angular; run store-form/route tests |
| Structural collapse breaks existing route tests | High | Update `store-routes.test.tsx` alongside |
| Change exceeds 400-line review budget | High | tasks phase MUST emit Review Workload Forecast; work-unit commit boundaries |

## Rollback Plan
All work lands as conventional commits on `feat/frontend-parity-audit` (no PR, no push). Revert the stores work-unit commits to restore prior structure; deletions and route changes are self-contained.

## Dependencies
- Shared Button/Card/InfoBox + design tokens (parent audit L5 foundation) must exist before L5 chrome.

## Delivery
Commits ONLY on `feat/frontend-parity-audit`. No PR, no push. Conventional commits, no AI attribution. Likely > 400 lines (structural refactor + deletions) — tasks phase should forecast and may warrant work-unit boundaries: (1) structure collapse, (2) admin-stores confirmations, (3) L5 visual, (4) L6 i18n. Delivery stays single-branch commits-only.

## Success Criteria
- [ ] All three `management/stores*` URLs render the edit form (id from param `|| selectedStoreId`) with title switching; no list table.
- [ ] `BaseRepository<Store>` offline layer + degraded banner removed from Management; flow is HTTP-only.
- [ ] `admin/stores` shows confirm dialogs before Approve/Disapprove; Activate/Deactivate hidden.
- [ ] Stores flow uses shared Button/Card/InfoBox + icons + FAB chrome.
- [ ] Spanish texts match Angular exactly; no voseo; no hardcoded strings.
- [ ] Required-validation messages are field-name-aware per Angular.
- [ ] Users + Configurations explicitly deferred, not touched.
