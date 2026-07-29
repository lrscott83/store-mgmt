# Backend — Pending Work

Date: 2026-07-28
Status: **open backlog.** Nothing here is implemented.
Scope: `backend/` only. Frontend work is tracked separately — see "Not in this document" at the end.

This is the index of backend work that is planned but not built. Each item states the
problem, the proposed solution, and where the full plan lives. Read this file first; the
linked plans hold the detail.

---

## 1. Billing — existing stores are flagged as delinquent (defect F1)

**Problem.** Migration `20250116145520_Create-ReSeller-StorePayment-Tables` created
`Store.PaymentStartDate` as NOT NULL with `defaultValue: new DateOnly(1, 1, 1)` — a
sentinel, never a real date. Migration `20260727165912_StorePayment-ReSeller-Commission-Fields`
then made the column nullable but did **not** convert existing rows.

Every pre-existing store still holds `0001-01-01`, which is not `null`. So
`StoreBillingUtils.GetStatus` reads it as a real date, concludes it expired two thousand
years ago, classifies the store as `Vencido`, and `GetMeQueryHandler.FilterForBilling`
strips every paid module from it.

This is arithmetic over data already in the database, not a hypothesis.

**Solution.** A new EF migration whose `Up()` runs:

```sql
UPDATE "Store" SET "PaymentStartDate" = NULL WHERE "PaymentStartDate" = DATE '0001-01-01'
```

`Down()` is intentionally empty — reverting would reintroduce the sentinel. The SQL
literal lives in a shared constant referenced by both the migration and its test, so the
test cannot drift from the statement it verifies.

**Policy decision still to confirm with the product owner.** All sentinel rows become
`null`, meaning no pre-existing store starts billing automatically; activating billing
becomes an explicit operator action through `PUT /stores/{id}/payment-date`. Rationale: a
data migration is irreversible in practice, so the chosen option is the one that cannot
interrupt service or fabricate debt for an existing customer.

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-design.md` (finding F1, change C1).

---

## 2. Billing — unrepresentable date arithmetic can return 500 (defect F2)

**Problem.** `BillingService.GetStoreBillingSummaryAsync` and
`GetStoresToCollectQueryHandler` pass `store.PaymentStartDate ?? DateOnly.MaxValue` into
`StoreBillingUtils.GetNextDueDate`, which computes `paymentStartDate.AddMonths(trialMonths + 1)`.
`DateOnly.MaxValue` is 9999-12-31; adding months overflows the representable range and
`DateOnly.AddMonths` throws `ArgumentOutOfRangeException`. A free store with no payments
would fail `/auth/me` with a 500.

**Evidence status: hypothesis.** This is derived from reading the code; the failure has
not been observed. The first unit test written under the plan confirms or refutes it
BEFORE any fix is applied.

**Solution.** `GetNextDueDate` changes signature to accept `DateOnly?` and return
`DateOnly?`, returning `null` when `paymentStartDate` is `null`. Both call sites drop the
`?? DateOnly.MaxValue` substitution. `GetStatus` already returns `NoAplica` for a null
start date; its signature adapts to the nullable due date.

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-design.md` (finding F2, change C2).

**Shared root cause with item 1**: `null` is the correct domain model for "the billing
clock never started", and the code keeps substituting a magic date for it. Note also that
`BillingService` is the only billing class with no test file at all — and it is the one
carrying this defect.

---

## 3. Billing — the clock cannot be moved in tests

**Problem.** Four billing call sites read `DateTime.UtcNow` directly: `BillingService`,
`GetMeQueryHandler`, `GetStoresToCollectQueryHandler`, `UpdateStoreCommandHandler`. With
the clock pinned to real time, due dates, grace periods and trial expiry cannot be tested
without waiting real days.

**Solution.** Move `IDateTimeProvider` from `Infrastructure/Interfaces/Services/` to
`Application/Abstractions/Time/`, matching the convention already used by
`IHttpContextService`, and inject it into those four call sites. This is a pure refactor —
the existing suite must stay green across it. It unlocks a `MutableDateTimeProvider` in
the end-to-end tests, with automatic restoration through an `IDisposable` scope.

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-design.md` (change C3).

---

## 4. Billing — an endpoint with no validator

**Problem.** `POST /stores/{storeId}/payments` has no validator, so an empty `storeId`
reaches the handler unchecked.

**Solution.** Add `RegisterStorePaymentCommandValidator` with `StoreId` `NotEmpty`,
shaped like the existing `SetStorePaymentDateCommandValidator`. Negative tests assert the
error **code**, not just the status — a 400 on its own proves nothing, it may be failing
for a different reason than intended.

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-design.md` (change C4).

---

## 5. Billing — dead code that bypasses an ownership guard

**Problem.** `Application/Services/Billing/StoreBillingService.cs` is registered in DI and
injected nowhere. Its `RecordManualPaymentAsync` duplicates
`RegisterStorePaymentCommandHandler` while omitting the reseller-ownership guard and the
`+1 month` due-date advance. It does not run today; the day someone injects it by mistake,
a reseller could charge a store it does not own.

**Solution.** Delete the class, its interface `IStoreBillingService`, and the DI
registration.

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-design.md` (change C5).

---

## 6. Billing — the test coverage matrix

**Problem.** The existing end-to-end suite covers 8 billing cases, all of them on stores
seeded with `PaymentStartDate = today`. The most common production shape — a free store
that never activated a paid plan, i.e. `PaymentStartDate = null` — has no test at all.
That gap is what hid defects F1 and F2.

**Solution.** The full four-category matrix across seven endpoints
(`PUT /stores/{storeId}/payment-date`, `POST /stores/{storeId}/payments`,
`GET /stores/to-collect`, `GET /stores/reseller-commissions`, `GET /auth/me`,
`PUT /stores/{id}`, `POST /features/activate`), plus a new `BillingServiceTests` file and
three missing `StoreBillingUtilsTests` cases. Two standing rules: negative tests assert
the error code, and money tests assert money (concrete amounts read back from the
persisted `StorePayment`).

**Plan**: `docs/plans/2026-07-28-billing-e2e-coverage-plan.md` (2687 lines, tasks 1-19)
and `docs/plans/2026-07-28-billing-new-endpoints-test-suites.md` (reference material).

**Suggested work order** (strict TDD, each step starts with a failing test): item 2 →
item 3 → free-store `/auth/me` end-to-end test → item 1 → item 4 → item 6 → item 5.

---

## 7. Offline authentication — backend side

**Problem.** Not started. The app cannot authenticate without connectivity.

**Solution.** Planned in full, no code written.

**Plan**: `docs/plans/2026-07-25-offline-auth-backend-plan.md`.

**Constraint carried from the frontend side**: offline authentication must be OPTIONAL.
The mode is decided by ONE question asked before any credential is evaluated — is the
roster file imported on this device? If it is, authentication goes offline against that
file regardless of connectivity; if it is not, the app must run online-auth normally and
must not break.

### 7a. The roster export endpoint blocks frontend Task 10

`GET /v1/storeusers/{storeId}/offline-roster` does not exist. The frontend can build and
unit-test the offline auth service and the device-provisioning route against
self-serialized bundles, but the admin "Export offline roster" action cannot be verified
end-to-end until this endpoint ships. Tracked as a dependency, not as frontend work.

**Status on the frontend side.** Task 10 of change `offline-auth-frontend` is implemented
and committed on branch `feat/offline-auth-frontend`
(`frontend-react/apps/web-store-pos/app/shared/lib/http/roster-http-service.ts` plus
`app/management/users/components/roster-export-panel.tsx`), and its `sdd-verify` pass
recorded it as **BLOCKED-for-verification**, not as done. The unit tests prove only URL
construction and `response.data.data` unwrapping against a hand-built mock. Both the
source file and its test carry an explicit `BLOCKED-for-verification` comment so the gap
stays visible through archive.

**The contract the frontend already assumes.** These are the assumptions the mock
encodes. Each one is unverified against a real payload, and each is a place where the
backend can either match the assumption or force a frontend change:

| Assumption | Source of truth on the frontend |
| --- | --- |
| Route prefix is `/v1`, not `/api/v1` | matches `auth-http-service.ts:12`, `user-http-service.ts:39` |
| Response is enveloped — the bundle lives at `response.data.data` | `roster-http-service.ts` |
| Field casing is camelCase | `roster-types.ts` |
| `issuedAt` / `expiresAt` are **epoch milliseconds**, not ISO strings | `OfflineRosterBundle` in `roster-types.ts` |
| Every user carries `verifier: { hash, salt, iterations }` | `OfflineVerifier` in `roster-types.ts` |
| Bundle carries `bundleId`, `formatVersion`, `storeId`, `users[]` | `OfflineRosterBundle` |
| Each user carries `id`, `login`, `fullName`, `isActive`, `roles`, `featureIds`, `storeModuleIds`, `isSuperAdmin`, `isOwnerAdmin`, `isReSeller`, `selectedStoreId` | `OfflineRosterUser` |

`bundleId` and `formatVersion` are not decoration: the frontend enforces anti-replay by
rejecting a re-imported `bundleId`, and gates on `formatVersion`. A bundle missing either
one is rejected at import.

Note that `verifier` is the item with no frontend fallback. If the real export cannot
carry a password verifier per user, offline authentication has no way to check a
credential and the whole change needs rethinking — this is the assumption worth
confirming first.

### 7b. The roster DTO carries no billing fields — decision needed

`UserModel` on the frontend gained three REQUIRED fields from the billing feature
(commit `b57fc3e`, 2026-07-27): `paymentDueDate`, `isInTrial`, `paymentStatus`. The
planned `OfflineRosterUserDto` carries none of them.

Consequence today: a user hydrated from the roster gets the codebase's established
"no billing data" defaults (`paymentStatus: 'NoAplica'`, `isInTrial: false`,
`paymentDueDate: null`), which means the payment banner stays silent. **A store whose
plan is actually expired would show no payment warning while operating offline.**

The decision belongs here, on the backend side: either the roster export includes the
billing snapshot (add the three fields to `OfflineRosterUserDto`, accepting that the
values are as stale as the bundle), or offline sessions deliberately carry no billing
signal. Until this is decided, the frontend proceeds with the silent-banner defaults.

### 7c. The same endpoint blocks frontend Task 13 (manual acceptance)

Task 13 of `offline-auth-frontend` is the human smoke walkthrough. It has nine steps,
documented with exact instructions in
`docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md`. **None has been
executed**, and three cannot be, today:

- **13.1** — as OwnerAdmin, online, click "Export offline roster" and get a real file.
  Blocked directly on §7a: the endpoint does not exist.
- **13.2** — on a second device, import that file at `/auth/provision`. Blocked on 13.1;
  a hand-crafted bundle would only re-test the frontend's own serializer, which is
  already unit-tested, so it would prove nothing new.
- **13.3** — go offline and log in against the roster. Blocked on 13.1 and additionally
  on `pwa-offline-shell`'s own pending manual DevTools walkthrough (that change is merged
  to `main` at 28/30 but not archived).

Steps 13.4 through 13.9 — wrong password offline, replay rejection, idle lock, the
unprovisioned-device regression pass, the mode-switch pass, and bundle expiry — are
executable today against a hand-crafted bundle and are simply not run yet. They are
frontend/QA work, not backend work; they are listed here only so the blocking
relationship is readable from one place.

**What shipping §7a unblocks.** One backend endpoint closes both frontend Task 10's
end-to-end verification and smoke steps 13.1–13.3. Until then the change is honestly
described as code-complete and automated-tests-green, not manually verified.

---

## 8. At-rest encryption — backend side

**Problem.** Not started. Local data is stored unencrypted.

**Solution.** Planned in full, no code written. Derived DEK via HKDF, no EF migration
required.

**Plan**: `docs/plans/2026-07-25-at-rest-encryption-backend-plan.md`, with the shared
design in `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md`.

**Ordering decision already made**: offline-auth ships before at-rest encryption.

---

## Known debt recorded but deliberately not scheduled

From the billing design, these are documented and intentionally left alone:

- `StoreSeed.SeedStoreAsync` seeds `PaymentStartDate = today` unconditionally, which is
  what hid F2. The correct default is `null`, but changing it breaks roughly 60 tests
  unrelated to billing. Needs its own change.
- The due-soon window is hard-coded to 5 days in both `BillingService` and
  `GetStoresToCollectQueryHandler`, while the grace period is configurable through
  `SystemConfiguration`.
- `GetMeQueryHandler` computes `IsInTrial` inline with a hard-coded one-month window,
  ignoring the configured `TestingPeriodInMonths` and duplicating
  `StoreBillingUtils.IsInTrial` — two sources of truth for the same rule. Fixing it
  changes behaviour for any tenant with a trial other than one month, so it needs product
  sign-off.
- `Domain.Tests` exists on disk but is not referenced by `SMCA.sln`, and duplicates a test
  file from `Domain.UnitTests`.
- `BillingService` names a variable `trialDays` while reading a value in months. Behaviour
  is correct, the naming is misleading.

---

## Not in this document

Frontend work is tracked separately and is NOT part of this backlog:

- `pwa-offline-shell` — merged to `main` at 28/30 tasks, pending its manual offline
  acceptance walkthrough, the debug-log removal commit, re-verify and archive. See
  `openspec/changes/pwa-offline-shell/`.
- Dev/preview port separation in `frontend-react/apps/web-store-pos/vite.config.ts`.
- `docs/plans/2026-07-25-offline-auth-frontend-plan.md`.
- `offline-auth-frontend` — code-complete on branch `feat/offline-auth-frontend`, 12 of 13
  tasks done, `sdd-verify` PASS WITH WARNINGS. Pending archive, plus smoke steps 13.4–13.9
  which need no backend. Its two blocked items are §7a and §7c above. See
  `openspec/changes/offline-auth-frontend/`.
- `frontend-react/apps/web-store-pos` has no `eslint.config.js`, so its `lint` script
  cannot run even though the app already depends on `@store-mgmt/eslint-config`. Its
  enforced gate is `tsc --noEmit`. Enabling lint needs its own change.
- `docs/plans/2026-07-25-at-rest-encryption-frontend-plan.md`.
