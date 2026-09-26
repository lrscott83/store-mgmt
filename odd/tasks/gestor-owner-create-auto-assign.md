# gestor-owner-create-auto-assign

- Status: in_progress
- Date: 2026-09-26
- Route: delegated direct (one writer: backend handler + frontend redirect + new tests)
- Authorization: user-directed. "ambos hacen lo mismo y es crear el gestor con lo mismo
  que hace register, no crear el owner, despues la tienda ni nada de eso. Se crear el
  Owner como mismo el register, eso es lo que tiene que pasar."
- TDD: ENABLED by explicit user instruction (carried from the previous unit). Runner:
  `dotnet test` (backend) and vitest (frontend). RED before implementation, then GREEN.

## Relationship to the previous unit

Follows `odd/tasks/owner-create-empty-resellerid-400.md` (commit `ded38c80`), which made
the POST accept an empty `reSellerId`. That fix alone is NOT sufficient: it stops the 400
but leaves the created owner with no Gestor link, so a Gestor landing on the owners list
would not see the owner they just created. This unit closes that gap.

## Objective and problem

1. After creating an owner, BOTH a Gestor and a SuperAdmin must stay on the owners
   list. There must be no redirect to store creation, no `logout()`, no trip to
   `/login`.
2. The created owner must be assigned the creating Gestor, exactly the way
   `RegisterCommand` does it.

### Why (1) currently fails

`owner-create.tsx:104` navigates unconditionally to `/management/stores/create`. That
route maps to `management/stores/routes/edit-store.tsx:13`, whose `clientLoader` is
`ownerStoresGate()` → `adminLoader()` (`auth/routes/loaders.ts:124-133`), which admits
only `isSuperAdmin || isOwnerAdmin`. A ReSeller fails it → `denyAccess()`
(`loaders.ts:17-20`) → `logout()` + `redirect('/login')`. So the owner is created and
the actor is thrown out of the app with no feedback.

### Why (2) is mandatory, not cosmetic

`GetReSellerOwnersIncludingStoreModulesAsync` (`OwnerRepository.cs:76-87`) filters on
`o.ReSellerOwner != null && o.ReSellerOwner.ReSeller.UserId == reSellerId`. A Gestor's
list therefore contains ONLY owners with a `ReSellerOwner` row pointing at that Gestor.
Delivering (1) without (2) would make the owner INVISIBLE in the list the user is
being sent to — a silent failure that invites duplicate owners.

## Root cause

`CreateOwnerCommandHandler.Handle` creates the `ReSellerOwner` row only when
`request.ReSellerId.HasValue` (`CreateOwnerCommand.cs:59-60`). The client only ever
sends a value when the actor is a SuperAdmin who picked one, so a Gestor's created owner
never gets the link. The handler trusts the body and never derives the creator from
`_httpContextService.UserExternalId`.

The model to mirror is `RegisterCommand.cs:109-136`, which resolves the ReSeller and
calls `ReSellerOwner.Create(reSeller.Id, owner.Id, reSeller.DiscountPrice,
reSeller.PercentDiscountPrice, owner.TenantId)`.

## Product facts (settled with the user)

- A **SuperAdmin is not a Gestor** and has no `ReSeller` entity, so "assign the creator
  as Gestor" is impossible for that role. SuperAdmin keeps the existing manual
  `reSellerId` selector.
- A SuperAdmin who leaves the selector on `--` creates an owner with no Gestor, which is
  therefore invisible to every Gestor. This is EXISTING behavior, not a regression.
  Noted, not changed.
- **No store is created.** `RegisterCommand` also creates a store, but the user
  explicitly rejected that. Only the `ReSellerOwner` part of register is mirrored.
- When the actor is a ReSeller, the derived Gestor WINS and any body `reSellerId` is
  ignored, so a Gestor cannot assign the new owner to a different Gestor.

## Scope

- **Backend (IN):** `CreateOwnerCommandHandler` — when the actor is a ReSeller, resolve
  its `ReSeller` via `IReSellerRepository.GetByUserIdIgnoreQueryFiltersAsync(userId)`
  (already exists, `IReSellerRepository.cs:10`) and create the `ReSellerOwner` link,
  mirroring `RegisterCommand`. Keep the existing SuperAdmin path (body `reSellerId`)
  byte-compatible.
- **Frontend React (IN):** `owner-create.tsx` — after a successful create, navigate to
  `/admin/owners` for both roles instead of `/management/stores/create`.
- **Backend E2E (IN):** NEW test file under
  `backend/src/SMCA.WebApi.E2ETests/Owners/`. Adding new E2E tests is allowed. Existing
  E2E tests must NOT be modified, deleted, renamed, skipped or weakened.
- **Frontend unit tests (IN):** add cases to
  `frontend-react/apps/web-store-pos/app/admin/owners/routes/__tests__/owner-create.test.tsx`
  (vitest — NOT the Playwright E2E suite, so it is not covered by the E2E-untouchable rule).
- **Angular `frontend/` (FORBIDDEN):** legacy, never read, never touched.
- **Out of scope:** the Playwright suite (`frontend-react/e2e/`), `UpdateOwnerCommand`,
  the `ownersAdmin`-era plan/feature-91 leak, and any store-creation behaviour.

## Tasks

- [ ] T1 — RED: backend E2E proving a ReSeller actor's created owner gets a
      `ReSellerOwner` row pointing at that ReSeller, and that the owner then appears in
      `GET /v1/owners/all/true` for that actor. Observe FAIL.
- [ ] T2 — RED: backend E2E proving a body `reSellerId` naming a DIFFERENT ReSeller is
      ignored when the actor is a ReSeller (the derived one wins).
- [ ] T3 — GREEN: implement the handler change.
- [ ] T4 — Regression E2E: SuperAdmin with a valid `reSellerId` still links correctly;
      SuperAdmin with no `reSellerId` still returns 201 and creates no link.
- [ ] T5 — RED/GREEN frontend: `owner-create.test.tsx` asserts the post-create
      navigation target is `/admin/owners` for a Gestor and for a SuperAdmin.
- [ ] T6 — Run the backend E2E Owners filter, Application.Tests, and the frontend vitest
      for the owner-create file; report observed results honestly.
- [ ] T7 — Work-unit commit on the feature branch, tests included.

## Acceptance criteria

1. A ReSeller actor POSTs to `/api/v1/owners` with no `reSellerId` → 201, a
   `ReSellerOwner` row links that ReSeller to the new owner, and the owner appears in
   that actor's `GET /v1/owners/all/true`.
2. A ReSeller actor POSTs with another ReSeller's `reSellerId` in the body → the link
   points at the ACTOR's ReSeller, not the body value.
3. A SuperAdmin actor POSTs with a valid `reSellerId` → link created (no regression).
4. A SuperAdmin actor POSTs with no `reSellerId` → 201, no link (no regression).
5. After a successful create, the React page navigates to `/admin/owners` for BOTH
   roles; no logout and no trip to `/login`.
6. No existing E2E test modified; no Angular file read or touched.
7. `dotnet test` and vitest results reported as observed, with any pre-existing failure
   named explicitly (a failing existing test is information, not an obstacle).

## Known pre-existing failure (not ours, do not touch)

`Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
(`SMCA.WebApi.E2ETests/Auth/AuthRegisterPlanTests.cs:131`) fails on `qa`: feature 91
leaks into a plan's store role features. Confirmed pre-existing by stashing the previous
unit's changes. Baseline: Failed 1 / Passed 580 / Total 581.

## Authorized scope for this change

Backend production: `CreateOwnerCommandHandler`. Frontend production: `owner-create.tsx`.
New E2E test file; new vitest cases in an existing frontend unit test file. Anything
else — an existing E2E test, `UpdateOwnerCommand`, the Playwright suite, Angular, or
store creation — means STOP and report.
