# Offline Roster — Billing Fields, Frontend Impact

Date: 2026-08-04
Scope: `frontend-react/` only.
Upstream: `docs/plans/2026-07-30-offline-roster-billing-gate-backend-plan.md`, Task 4.

This file is the destination that plan's Task 4 writes to. It replaces
`2026-07-30-register-endpoint-fixes-frontend.md`, which was deleted once its own contents
were confirmed resolved in code.

## Status

**Blocked on the backend.** As of 2026-08-04 none of the upstream plan's three tasks are
implemented — verified against `backend/src`:

- `ExportOfflineRosterQuery.cs` does not call `StoreBillingUtils.FilterForBilling`
- `ExportOfflineRosterQuery.cs:134` still hard-codes `now.AddDays(35)`
- `ExportOfflineRosterQuery.cs:33` still emits `FormatVersion = 2`
- `OfflineRosterUserDto` carries no `PaymentDueDate` / `IsInTrial` / `PaymentStatus`
- `GetOfflineRosterTtlDaysAsync` does not exist

Nothing is actionable on the frontend until those ship. The contract below is what the
upstream plan specifies, not what exists on the wire today.

## Task 1: Record the shipped contract

Carried over verbatim from the upstream plan's Task 4, with the destination corrected to
this file.

- [ ] **Step 1: Append the resulting contract here** — `formatVersion` 2 → 3, the three new
  per-user billing fields, and the new `expiresAt` window. State the values that actually
  shipped, not the ones planned.
- [ ] **Step 2: Commit.**

## Expected contract, per the upstream plan

| Aspect | Today (v2) | After the backend ships |
|--------|-----------|-------------------------|
| `formatVersion` | `2` | `3` |
| `paymentDueDate` | absent | `string \| null` (`DateOnly?`) |
| `isInTrial` | absent | `boolean` |
| `paymentStatus` | absent | same enum `/auth/me` returns |
| `expiresAt` | `issuedAt + 35 days` | `issuedAt + configured TTL` (7 days recommended, pending sign-off) |

## Frontend consumers to revisit once it ships

- `app/shared/lib/offline/roster-types.ts` — declares `formatVersion: number` and none of the
  three billing fields.
- The `needsUnlock` gate reads `formatVersion >= 2`; confirm a v3 bundle still satisfies it.
- The payment banner is silent offline today because the device has nothing to gate on. These
  fields are what would let it re-derive the gate.

## Out of scope

- Any backend change. Tasks 1-3 of the upstream plan own that.
- Acting on the fields before they exist on the wire.
