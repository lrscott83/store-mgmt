# Offline Roster — Billing Gate Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-07-30
Scope: `backend/` only. Frontend impact is recorded in `docs/plans/2026-08-04-offline-roster-billing-fields-frontend.md`; do not implement it here.
Supersedes: §7b of `docs/plans/2026-07-28-backend-pending-work.md`, which framed this as "the payment banner stays silent". That framing understated it — see below.

**Goal:** Make the billing gate exist offline. Today it does not: `ExportOfflineRosterQuery` ships every store module regardless of payment status, and the bundle carries no billing data for the device to re-derive the gate from.

**Architecture:** Three changes that solve three different problems and are not substitutes for one another — (1) enforce the gate in the exported data, mirroring what `/auth/me` already does; (2) carry the billing snapshot so the device can *explain* the gate to the user; (3) bound how stale that snapshot may become, which is the only one of the three that protects against a store that expires *after* export.

**Tech Stack:** .NET 8, MediatR 12, EF Core, xUnit + Moq + FluentAssertions (unit), Mvc.Testing (E2E). Solution: `backend/src/SMCA.sln`.

---

## The defect, stated precisely

`GetMeQuery.cs:71` gates the online session:

```csharp
List<int> storeModuleIds = StoreBillingUtils.FilterForBilling(storeModules, billing);
```

`FilterForBilling` (`Domain/Common/Utils/StoreBillingUtils.cs:53-62`) returns every module unless the status is `Vencido`, in which case only modules with `PriceIncluded` survive. That is the paid-module lock.

`ExportOfflineRosterQuery.cs:75-76` does not call it:

```csharp
var storeModules = await _storeModuleRepository.GetStoreModulesByIdAsync(query.StoreId);
var storeModuleIds = storeModules.Select(sm => sm.ModuleId).ToList();
```

Consequences, in order of severity:

1. **The paid-module lock does not exist offline.** Export a roster from a store in `Vencido` and every device importing it holds full paid access. This is a licensing hole, not a UX gap.
2. **The device cannot re-derive the lock.** `OfflineRosterUserDto` carries no `paymentDueDate` / `isInTrial` / `paymentStatus`, so even a correct client has nothing to gate on. The frontend falls back to `NoAplica` / `false` / `null` and the payment banner stays silent.
3. **The bundle outlives the billing cycle.** `ExpiresAt = now.AddDays(35)` (`ExportOfflineRosterQuery.cs:134`) against a monthly cycle (`GetNextDueDate` = `AddMonths(trialMonths + 1)`). A store that goes overdue three days after export keeps full paid access for another 32.

Task 1 fixes (1). Task 2 fixes (2). Task 3 fixes (3), and is the only one that constrains a store expiring after the export.

---

## Global Constraints

- **Online endpoints are UNTOUCHED.** `/auth/me`, `/login`, and the existing session behaviour do not change. This plan modifies the export path only.
- **Do not duplicate the gate rule.** Task 1 calls the existing `StoreBillingUtils.FilterForBilling`. Do not reimplement the `PriceIncluded` condition in the export handler — two copies of a licensing rule is how they drift.
- **`IDateTimeProvider` is the clock.** It already lives at `Application/Abstractions/Time/`. Do not read `DateTime.UtcNow` directly; the E2E suite pins time through `MutableDateTimeProvider`.
- **JSON casing:** default camelCase. Do not add JSON config.
- **`ResponseResult<T>`** remains the handler return shape.
- **This is a breaking contract change for the PWA.** Frontend work is out of scope here but must be recorded — see Task 4.

---

## File Structure

- Modify `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs` — apply the gate, attach billing fields, read TTL from configuration.
- Modify `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs` — three billing properties.
- Modify `Application/Abstractions/.../ISystemConfigurationRepository.cs` + its implementation — `GetOfflineRosterTtlDaysAsync`.
- Modify `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`.
- Modify `SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs`.

---

### Task 1: Apply the billing gate to the exported module list

**Files:**
- Modify: `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`
- Test: `Application.Tests/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQueryHandlerTests.cs`

The handler must load the store's billing summary and filter through `StoreBillingUtils.FilterForBilling` before `storeModuleIds` is used — note it feeds both `GetStoreRoleFeaturesByUserIdAsync` and `GetAllowedFeatureIdsForUserAsync`, so filtering at the single assignment covers roles and features together.

- [ ] **Step 1: Write the failing tests.** Three cases: a store in `Vencido` exports only `PriceIncluded` modules; a store `AlDia` exports all modules; a store `NoAplica` (never started billing) exports all modules. Assert on the module ids in the returned DTO, not on a mock call.
- [ ] **Step 2: Run the tests and confirm the `Vencido` case fails** — the other two should already pass, which is the proof that the gate is the only thing missing.
- [ ] **Step 3: Inject the billing summary source** into the handler, matching how `GetMeQuery` obtains it.
- [ ] **Step 4: Filter `storeModuleIds`** through `StoreBillingUtils.FilterForBilling`.
- [ ] **Step 5: Run the tests to verify they pass.**
- [ ] **Step 6: Run the full backend suite** — `ExportOfflineRosterTests` and the billing E2E suites must stay green.
- [ ] **Step 7: Commit.**

---

### Task 2: Carry the billing snapshot in the roster

**Files:**
- Modify: `Application/Dtos/Management/StoreUsers/OfflineRosterUserDto.cs`
- Modify: `Application/Features/Management/Users/Queries/ExportOfflineRoster/ExportOfflineRosterQuery.cs`
- Test: both test files above

Add `PaymentDueDate` (`DateOnly?`), `IsInTrial` (`bool`), `PaymentStatus` (the same enum/string `/auth/me` returns). Populate from the same billing summary Task 1 already loads — do not query twice.

**Bump `FormatVersion` from 2 to 3.** The frontend gates on this value, and a v2 bundle is now distinguishable from a v3 one by more than decoration: v2 lacks the fields the banner needs. Shipping new fields under the old version number means a device cannot tell "this store has no billing" from "this bundle predates billing".

- [ ] **Step 1: Write the failing assertions** — an exported user for a `Vencido` store carries `paymentStatus: Vencido` and a non-null `paymentDueDate`; a `NoAplica` store carries `NoAplica` / `false` / `null`. Assert `formatVersion == 3`.
- [ ] **Step 2: Run the tests to verify they fail.**
- [ ] **Step 3: Add the three properties to the DTO.**
- [ ] **Step 4: Populate them in the handler** from the billing summary loaded in Task 1.
- [ ] **Step 5: Bump `FormatVersion` to 3.**
- [ ] **Step 6: Run the tests to verify they pass.**
- [ ] **Step 7: Commit.**

---

### Task 3: Bound the staleness — bundle TTL

**DECISION REQUIRED BEFORE THIS TASK. Do not pick a value unilaterally.**

Tasks 1 and 2 are snapshots taken at export time. Neither does anything about a store that is `AlDia` when exported and `Vencido` a week later — the device keeps the module list it was given. The only lever against that is how long a bundle stays valid, currently **35 days against a monthly billing cycle**.

**Recommendation:** make the TTL configurable through `SystemConfiguration` (the same mechanism already used for `DueSoonDays` and the grace period, so the pattern exists), with a default of **7 days**.

**The trade, stated plainly:** a shorter TTL means devices must re-provision more often. A store with genuinely poor connectivity — the exact customer offline auth exists for — now re-imports the roster weekly instead of monthly. That cost is real and falls on the customer who needs the feature most. Seven days is proposed because it is comfortably inside a monthly cycle while still surviving a week-long outage, but the number is a product call, not an engineering one.

- [ ] **Step 0: Get the TTL value signed off.** Record the decision and who made it in this file before writing code.
- [ ] **Step 1: Write the failing test** — a bundle exported at a pinned time carries `expiresAt == issuedAt + configured TTL`. Use `MutableDateTimeProvider`.
- [ ] **Step 2: Run the test to verify it fails.**
- [ ] **Step 3: Add `GetOfflineRosterTtlDaysAsync`** to the system configuration repository and its interface, following `GetDueSoonDaysAsync`.
- [ ] **Step 4: Replace the hard-coded `AddDays(35)`** with the configured value.
- [ ] **Step 5: Seed the configuration row** with the signed-off default.
- [ ] **Step 6: Run the tests to verify they pass.**
- [ ] **Step 7: Run the full backend suite.**
- [ ] **Step 8: Commit.**

---

### Task 4: Record the frontend impact

- [ ] **Step 1: Append the resulting contract to** `docs/plans/2026-08-04-offline-roster-billing-fields-frontend.md`: `formatVersion` 2 → 3, the three new per-user billing fields, and the new `expiresAt` window. State the values that actually shipped, not the ones planned.
- [ ] **Step 2: Commit.**

---

## Verification

- [ ] `dotnet build` clean on `backend/src/SMCA.sln`.
- [ ] Full unit suite green (`Application.Tests`, `Domain.UnitTests`).
- [ ] Full E2E suite green (`SMCA.WebApi.E2ETests`) — in particular the 13 `Billing/` suites and `Users/ExportOfflineRosterTests.cs`.
- [ ] A manual export against a `Vencido` store returns a bundle whose `storeModuleIds` excludes every module where `PriceIncluded` is false.

## Out of scope

- Any frontend change. The PWA cannot read `formatVersion: 3` until its own change ships; sequence the release accordingly.
- Revoking bundles already in the field. There is no revocation channel today, and adding one is a separate design — which is precisely why the TTL in Task 3 is the control that matters.
- Changing `FilterForBilling` itself. The rule is correct; it was simply never applied on this path.
