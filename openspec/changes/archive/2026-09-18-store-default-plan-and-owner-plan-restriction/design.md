# Design: Store Default Plan Pago + Owner Plan Restriction

## Technical Approach

Two backend changes plus two frontend filter points, implementing the delta spec (`billing/spec.md` caller matrix + `management-stores/spec.md` Plan Panels Activation Contract). Birth divergence accepted via Option A: the backend default flips to Pago while the frontend keeps resolving the Superior plan's member moduleIds for birth provisioning (`CreateStoreService.cs:45` default line only). No DB migration, no new endpoints, no VIP catalog change.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|---|---|---|---|
| AD-1 | Enforcement layer | Handler-level gate inside `ChangeStorePlanCommandHandler.Handle()`, after ownership guard (:95), before preconditions (:97) | Attribute-based policy, endpoint-level filter, separate authorization service | PlanType-conditional logic is not expressible at attribute level without new infrastructure; handler gate is minimal, auditable, reuses `_httpContextService.IsSuperAdmin` already resolved at :90 |
| AD-2 | VIP catalog visibility | VIP stays excluded from `GET /v1/plans` | Add a SuperAdmin-only VIP catalog endpoint | Changes no SuperAdmin UI surface; VIP remains API-only. Zero catalog-scope risk |
| AD-3 | Birth module-set derivation | `CreateStoreService` default line only; kept field for module-set derivation (Option A) | Also re-derive birth modules from the Pago plan catalog | The plan≠module-catalog divergence at birth is intentional (spec scenario "Birth module set unchanged") — pinning it, not hiding it |

## Data Flow

```
createStore ──→ CreateStoreService.CreateStoreAsync
     │             store.StorePlanId = StorePlanType.Pago   ← CHANGED (:45)
     └─ moduleIds = request list (Superior members from edit-store.tsx:101-106) ← UNCHANGED

changePlan ──→ ChangeStorePlanCommandHandler.Handle()
     ├── ownership guard        (:89-95)   ← existing
     ├── role × PlanType gate   (insert :96) ← NEW — non-SA + {Superior, VIP} → 403
     └── preconditions + mutation (:97-121)  ← existing (gate never mutates — NoTracking-safe)
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `backend/src/Application/Services/Stores/CreateStoreService.cs:45` | Modify | `(int)StorePlanType.Superior` → `(int)StorePlanType.Pago`. No other change in this file. |
| `backend/src/Application/Features/StoreManagement/Stores/Commands/ChangeStorePlan/ChangeStorePlanCommand.cs` | Modify | Insert role×PlanType gate after :95 (ownership guard), before :97 (preconditions). |
| `frontend-react/apps/web-store-pos/app/management/stores/components/edit-plan-modal.tsx` | Modify | Filter `plans` by caller role before passing to `<PlanPanels>` (:85). Single point covers BOTH consumers — owner `my-stores.tsx:280` and SuperAdmin `admin/stores/routes/store-list.tsx:188`. |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/store-plan.tsx` | Modify | Same filter at :158-164 (route is reachable by OwnerAdmin via `adminFeatureLoader([Stores])`). |
| `frontend-react/apps/web-store-pos/app/management/stores/routes/edit-store.tsx` | Modify | Comments/doc only (:37-41, :160-162): store births on Pago (backend-owned plan), moduleIds = Superior members (Option A). **Verified**: create payload sends no `planId` — keys are `address, approved, description, moduleIds, name, ownerId` (store-creation-trial.test.tsx:265-273); backend decides plan. No functional change. |

### Gate (insert into `ChangeStorePlanCommand.cs` after line 95)

```csharp
// Caller matrix (billing/spec.md): non-SuperAdmin callers may only target
// Gratis or Pago — Superior/VIP are SuperAdmin-reserved.
if (!_httpContextService.IsSuperAdmin &&
    request.StorePlanId is (int)StorePlanType.Superior or (int)StorePlanType.VIP)
    throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
```

### Frontend filter (EditPlanModal — same pattern in store-plan.tsx before its `<PlanPanels>`)

```tsx
const { user } = useAuthStore();
const visiblePlans = user?.isSuperAdmin
  ? plans
  : plans.filter((p) => p.planType === 'Gratis' || p.planType === 'Pago');
// pass visiblePlans to <PlanPanels>
```

## Interfaces / Contracts

No new interfaces. `IHttpContextService.IsSuperAdmin` (property, already used at :90) drives both the gate and both frontend filters. Gate-hit response = `403 Forbidden` with localized `"Forbidden"` message — byte-identical shape to the existing ownership guard, so the UI's existing `httpErrorKey` error handler surfaces it with no new error state. An owner stuck on Superior targeting Superior idempotently now 403s instead of returning `data=true` — intentional, consistent with the matrix.

## Testing Strategy

Backend unit — `ChangeStorePlanCommandHandlerTests.cs` (R E D before GREEN):
- **New** `Handle_ownerTargetsSuperior_throwsForbidden`, **new** `Handle_ownerTargetsVIP_throwsForbidden`.
- `Handle_paidTarget_vipPlan_followsPaidRule` (:520-539) switches to `ArrangeSuperAdminCaller()` — it tests the override rule, not the gate.
- Positive Owner→Pago, Owner→Gratis already covered (:493, :567) — keep; add explicit Owner→Pago 200 if the matrix needs a named positive.

Backend E2E — `StoreCreatePlanTests.cs`: flip `SuperiorPlanId` assertions (:67, :119, :157, :198) to `PagoPlanId`; update class doc (:17-24) and const (:38); re-anchor `Create_store_defaults_to_superior_plan_matching_plan_catalog` (:135) to pin Pago birth + full module request list (divergence pinned).

Backend E2E — `ChangePlanPermissionFlipTests.cs` (HIGH rework): SA client performs plan flips (SA→Superior 200, SA→Pago 200); owner token still proves the MultiStores create-gate flip (403→201→403, same token, no relogin); add owner→Superior 403 as the new-rule pin.

Frontend unit — `my-stores.test.tsx:677`: owner's click target `/Superior/` → `/Pago/`. `store-creation-trial.test.tsx:249-276`: comments re-anchor to "Pago birth, Superior moduleIds"; `moduleIds=[2,3,4]` assertion unchanged. `store-routes.test.tsx:47-63`: catalog factory unchanged; no PlanPanels filter assertion exists there — no delta.

E2E — `owner-stores.spec.ts:152-156`: `'Plan: Superior'` → `'Plan: Pago'`. `plan-change-permission-refresh.spec.ts:120-136`: premise reworks Superior/Warehouses(13) → Pago/Statistics(6) delta for the upgrade leg.

## Threat Matrix

`N/A` — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary affected. The gate is in-application authorization only.

## Migration / Rollout

No migration required. Existing stores keep their plan; new stores birth on Pago after deployment. The gate is immediately active for existing stores (implicit SA-reservation retro-fit). All three changes are independently revertible: `StorePlanType.Pago`→`Superior` (one line), remove the gate if-block, remove the two frontend filters.

## Open Questions

- [ ] None blocking. `ChangePlanPermissionFlipTests` re-anchor shape (SA-flip + owner-token gate proof) is documented and ready for tasks, but flagged HIGH effort.