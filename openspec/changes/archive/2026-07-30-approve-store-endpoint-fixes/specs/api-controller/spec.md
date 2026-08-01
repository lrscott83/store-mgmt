# Delta for api-controller: StoresController (Approve + Disapprove)

**Domain**: `api-controller` — `StoresController.cs` (`ApproveStoreAsync`, `DisapproveStoreAsync`)  
**Change**: `approve-store-endpoint-fixes`  
**Precedent**: `update-store-endpoint-fixes/specs/api-controller/spec.md` — same pattern applied to UpdateStoreAsync

---

## ADDED Requirements

### SM-CA1 — XML `<summary>` Doc on Both Actions

Each action (`ApproveStoreAsync`, `DisapproveStoreAsync`) MUST have an XML `<summary>` comment describing its purpose.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Approve doc present | Source file inspected | `ApproveStoreAsync` declaration | `<summary>` exists with meaningful description |
| 1b | Disapprove doc present | Source file inspected | `DisapproveStoreAsync` declaration | `<summary>` exists with meaningful description |

### SM-CA2 — `[FromBody]` Attribute on Command Parameter

Both action parameters of type `ApproveStoreCommand` / `DisapproveStoreCommand` MUST be decorated with `[FromBody]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Approve has [FromBody] | Controller source inspected | `ApproveStoreAsync(ApproveStoreCommand command)` | `[FromBody]` present on `command` parameter |
| 2b | Disapprove has [FromBody] | Controller source inspected | `DisapproveStoreAsync(DisapproveStoreCommand command)` | `[FromBody]` present on `command` parameter |

### SM-CA3 — `[ProducesResponseType]` for 400, 401, 403, 404

Both actions MUST declare `[ProducesResponseType(StatusCodes.Status400BadRequest)]`, `[ProducesResponseType(StatusCodes.Status401Unauthorized)]`, `[ProducesResponseType(StatusCodes.Status403Forbidden)]`, and `[ProducesResponseType(StatusCodes.Status404NotFound)]`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | 400 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 400 BadRequest listed as possible response |
| 3b | 401 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 401 Unauthorized listed |
| 3c | 403 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 403 Forbidden listed |
| 3d | 404 documented | Swagger doc inspected | ApproveStoreAsync endpoint | 404 NotFound listed |
| 3e | 200 remains | Swagger doc inspected | ApproveStoreAsync endpoint | 200 OK still listed |
| 3f–3j | Same 5 for Disapprove | Swagger doc inspected | DisapproveStoreAsync endpoint | All 4 new + 200 listed |

### SM-CA4 — Same 3 Changes Mirror to DisapproveStoreAsync

SM-CA1 through SM-CA3 SHALL be applied identically to `DisapproveStoreAsync`. No behavioral difference between the two actions.

---

## MODIFIED Requirements

None. All changes are ADDED (new attributes/doc) with zero behavioral changes to the controller layer.

---

## Verification Criteria

- [ ] `ApproveStoreAsync` has XML `<summary>` doc
- [ ] `ApproveStoreAsync(Guid, ...)` has `[FromBody]` on command param
- [ ] `ApproveStoreAsync` has `[ProducesResponseType(400)]`, `[ProducesResponseType(401)]`, `[ProducesResponseType(403)]`, `[ProducesResponseType(404)]`
- [ ] Same 3 checks pass for `DisapproveStoreAsync`
- [ ] All existing E2E tests pass unchanged (controller changes are additive only)
