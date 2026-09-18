# Proposal: Store Default Plan Pago + Owner Plan Restriction

## Intent
Stores birth on Superior (`CreateStoreService.cs:45`) and Owners can reach Superior/VIP via change-plan — both contradict the "Superior/VIP = SuperAdmin" design. Fix: birth → Pago; Owner → Gratis/Pago; SuperAdmin unrestricted; ReSeller as-is.

## Scope

### In Scope
- Backend: birth default → Pago; change-plan gate — non-SuperAdmin + Superior/VIP → 403.
- React frontend (Angular frozen): owner UI → Gratis/Pago; edit-store ids kept.
- Authorized affected E2E/unit updates; canonical spec delta.

### Out of Scope
- VIP UI exposure (status quo: not in GET /v1/plans, no UI, SA-only).
- Birth feature set (D2: moduleIds unchanged; divergence accepted).
- ReSeller plan-change (no path today; toggle unchanged).
- E2E outside affected catalog — STOP/ask.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `billing`: caller rule (:536) → Owner targets Gratis/Pago only, Superior/VIP 403; "Owner changes to VIP" (:569-572) → 403; add birth-default requirement.
- `management-stores`: Plan Panels Activation Contract (:137-143) → dialog shows Owner only Gratis/Pago.

## Approach

- **D1 gate**: after ownership guard (:89-95): non-SuperAdmin + target PlanType ∈ {Superior,VIP} → 403; SA exempt (:90). No NoTracking issue (no mutation).
- **D2 Option A**: default → Pago only; moduleIds unchanged.
- **Matrix**:

| Caller | Gratis | Pago | Superior | VIP |
|---|---|---|---|---|
| Owner | ✓ | ✓ | 403 | 403 |
| SuperAdmin | ✓ | ✓ | ✓ | ✓ |
| ReSeller | toggle only | | | |

- Frontend: `edit-plan-modal.tsx:85-91` + `store-plan.tsx:158-164` role-filtered; `edit-store.tsx:101-106` ids kept.

## Open Items

- ChangePlanPermissionFlipTests re-anchor: SA→Superior keeps 201; owner → 403.
- plan-change-permission-refresh: rework premise: Superior/Warehouses → Pago/Statistics(6).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `backend/.../CreateStoreService.cs:45` | Modified | Default → Pago |
| `backend/.../ChangeStorePlanCommand.cs` | Modified | Non-SA Superior/VIP → 403 |
| `frontend-react/... edit-plan-modal.tsx`, `store-plan.tsx` | Modified | Role-filter panels |
| `frontend-react/.../routes/edit-store.tsx` | Modified | Keep ids; assert Pago |
| Affected E2E/unit tests | Modified | Flip pins |
| `openspec/specs/{billing,management-stores}/spec.md` | Modified | Matrix, birth default, panels |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| E2E premise breaks | High | Pago/Statistics rework (authorized set) |
| Module leak at Pago price | Accepted (D2) | No public feature change |
| Archive gate on drift | Med | Spec delta in-scope, synced pre-archive |

## Rollback Plan
`git revert` change commits. No migration/data rewrite.

## Dependencies
Local PostgreSQL (E2E).

## Success Criteria

- [ ] New store births `PlanType="Pago"`.
- [ ] Owner → Superior/VIP: 403 API + UI hidden; SA unchanged.
- [ ] Authorized tests green; unauthorized E2E untouched.
- [ ] Spec delta synced; archive-ready.