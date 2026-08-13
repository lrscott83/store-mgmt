# Proposal: H-10 — Enforce SuperAdmin-only store creation

## Intent
Only SuperAdmin may create stores. Today `POST /v1/stores` admits OwnerAdmin (201 + SelectedStoreId re-point) and rejects StoreUser with 400, not 403. Target: 403 for all others; no re-point.

## Context (current state)
- Class gate `[HasPermission(SuperAdmin, StoresAdmin)]` (`StoresController.cs:27`); POST carries no action-level attribute (83-91).
- Handler admits `IsSuperAdminOrOwnerAdmin` → 400 (`CreateStoreCommand.cs:50-51`); re-points `SelectedStoreId` (57-61).
- Both behaviors pinned by `StoreCreateAuthorizationGapTests.cs` and spec R2.10/R2.11.

## Scope

### In Scope (Approach D; user-authorized 2026-08-12)
- `StoresController.cs` POST: add `[HasPermission(StoreRoleFeatures.SuperAdmin)]` (mirrors payment-date/DELETE/approve/disapprove).
- `CreateStoreCommand.cs`: guard → `IsSuperAdmin`, status → `Forbidden` (50-51); remove re-point branch (57-61).
- `StoreCreateAuthorizationGapTests.cs`: rewrite both tests (OwnerAdmin → 403, no row, no re-point; StoreUser → 403).
- `authorization-e2e` delta: R2.10/R2.11 + criterion #8.

### Out of Scope
- Migration/audit of prior OwnerAdmin-created stores (forward-only).
- i18n message; standard 403 (sibling parity).
- Other store actions (PUT {id}, approve/disapprove, payment-date, OwnerAdmin own-store edit).
- Frontend (creation unreachable for OwnerAdmin; worst case generic alert).
- Auto-registration (`RegisterCommand.cs:82` bypasses this command — S1-01 safe).
- `StoresController.cs:88-90` 200-wrapped `Failure(NotCreated, 400)` — flagged, excluded.

## Capabilities
### New Capabilities
None.

### Modified Capabilities
- `authorization-e2e`: R2.10/R2.11 + criterion #8 replaced with corrected rule (non-SuperAdmin POST → 403, no persistence, no re-point).

## Approach
Approach D: (1) action-level attribute → real 403 (`ForbidResult`) before the handler — `SuperAdmin` has no `GetFeatureType`, so OwnerAdmin/StoreUser/ReSeller fail the filter; (2) handler hardened to `IsSuperAdmin`/`Forbidden` — no latent re-trigger via a non-HTTP MediatR caller; (3) dead re-point branch removed. Rejected: B, C (incomplete). Consistent with 4 sibling SuperAdmin-only actions.

## Affected Areas
| Area | Impact | Change |
|---|---|---|
| `StoresController.cs` | Modified | `[HasPermission(SuperAdmin)]` on POST |
| `CreateStoreCommand.cs` | Modified | Guard + status; re-point removed |
| `StoreCreateAuthorizationGapTests.cs` | Modified | Both tests assert 403 |
| `specs/authorization-e2e/spec.md` | Modified | R2.10/R2.11, criterion #8 |

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Blast radius: exactly 2 E2E tests + spec | Low | Verified: no other test POSTs as OwnerAdmin/StoreUser |
| Partial fix (attribute XOR handler) | Med | Approach D ships both halves in one change |
| S1-01 regression | Low | RegisterCommand bypass verified; regression run |
| Frontend OwnerAdmin 403 | None | Create mode unreachable; generic alert only |

## Rollback Plan
Git-revert the change commit (2 production files, test file, spec delta). No schema change. Re-run Stores E2E.

## Dependencies
- User authorization (granted 2026-08-12) for production + existing E2E test changes.
- PostgreSQL `smca_test` (E2E).

## Success Criteria
- [ ] OwnerAdmin with feature 73 → 403; no Store/StoreModule row; SelectedStoreId unchanged
- [ ] StoreUser with feature 73 → 403 (not 400)
- [ ] Stores-area E2E regression green (SuperAdmin creation intact)
- [ ] R2.10/R2.11 + criterion #8 document corrected behavior
- [ ] Auto-registration E2E green (S1-01)
