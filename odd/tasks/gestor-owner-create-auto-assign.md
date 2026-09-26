# gestor-owner-create-auto-assign

- Status: done
- Date: 2026-09-26
- Route: delegated direct (one writer: backend handler + frontend redirect + new tests)
- Commit: `e8138aa8` — `fix(owners): assign the creating Gestor and stay on the owners list`
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

- [x] T1 — RED: backend E2E proving a ReSeller actor's created owner gets a
      `ReSellerOwner` row pointing at that ReSeller, and that the owner then appears in
      `GET /v1/owners/all/true` for that actor. Observe FAIL.
- [x] T2 — RED: backend E2E proving a body `reSellerId` naming a DIFFERENT ReSeller is
      ignored when the actor is a ReSeller (the derived one wins).
- [x] T3 — GREEN: implement the handler change.
- [x] T4 — Regression E2E: SuperAdmin with a valid `reSellerId` still links correctly;
      SuperAdmin with no `reSellerId` still returns 201 and creates no link.
- [x] T5 — RED/GREEN frontend: `owner-create.test.tsx` asserts the post-create
      navigation target is `/admin/owners` for a Gestor and for a SuperAdmin.
- [x] T6 — Run the backend E2E Owners filter, Application.Tests, and the frontend vitest
      for the owner-create file; report observed results honestly.
- [x] T7 — Work-unit commit on the feature branch, tests included.

## RED evidence (observed, before the implementation)

Backend — new `OwnersCreateGestorAutoAssignTests`, `FullyQualifiedName~E2ETests.Owners`:

```
Failed ...Create_owner_as_reseller_links_the_actor_gestor_and_the_owner_shows_in_that_gestor_list
  Expected link not to be <null>.
Failed ...Create_owner_as_reseller_ignores_body_resellerId_and_links_the_actor_gestor
  Expected link!.ReSellerId to be {abb4bbfd-9adf-4b6d-bdbd-e692aa47012f}, but found {c12c095d-9895-449e-99ab-e8da61bbda50}.
Passed ...Create_owner_as_superadmin_with_valid_resellerId_persists_reseller_owner_link
Passed ...Create_owner_as_superadmin_without_resellerId_creates_no_reseller_owner_link
Failed: 2, Passed: 48, Total: 50
```

The two SuperAdmin cases passed from the start: they pin existing behaviour and correctly
produce no RED signal. The two Gestor cases failed for the two distinct reasons the change
fixes — no link at all, and the body value winning.

Frontend — `owner-create.test.tsx`, `Tests 3 failed | 28 passed (31)`, all three with
`AssertionError: expected "spy" to be called with arguments: [ '/admin/owners' ]`
(actual call: `/management/stores/create`).

## GREEN evidence (observed, after the implementation)

Backend `E2ETests.Owners` filter: `Failed: 0, Passed: 50, Total: 50`.
`Application.Tests`: `Failed: 0, Passed: 511, Total: 511`.
`owner-create.test.tsx`: `Test Files 1 passed (1) / Tests 31 passed (31) / Type Errors no errors`.

Frontend command actually run (from `frontend-react/apps/web-store-pos/package.json`
→ `"test": "vitest run"`), issued from `frontend-react/`:

```bash
pnpm --filter @store-mgmt/web-store-pos test -- --run --reporter=basic \
  app/admin/owners/routes/__tests__/owner-create.test.tsx
```

## Existing E2E test replaced (user-authorized)

The strict rule — "for a ReSeller actor the body `reSellerId` is ignored" — made
`OwnersCreateReSellerIdBindingTests.Create_owner_as_reseller_with_valid_resellerId_persists_reseller_owner_link`
(previous line 174) logically unsatisfiable: it pinned the exact opposite (a ReSeller-role
actor's body value must win). The user explicitly authorized replacing that ONE test and
nothing else in that file or in any other existing E2E test.

Its actor came from `DbTestHelpers.SeedUserWithRoleAsync`, which writes only `User` +
`UserRole` — a half-Gestor carrying the Gestor label with no `ReSeller` row. Production
cannot produce that state: `CreateReSellerCommand` always writes `User` + `ReSeller` +
`UserRole` together. The test asserted behaviour for a subject that does not exist, and its
assertion was the inverse of the product rule.

Replaced with
`Create_owner_as_real_gestor_links_the_actor_own_reseller_and_ignores_the_body_resellerId`:
the actor is a real Gestor (its own `ReSeller` row), the body names a DIFFERENT real seeded
ReSeller, and the persisted link must be the actor's and not the body's. The regression guard
the old test meant to provide — "a real seeded `ReSeller` row really does produce a persisted
`ReSellerOwner` link" — is preserved and now expressed under the correct rule.

No body-value fallback, third code path, or handler special-casing was added.

### Overlap worth a decision

`OwnersCreateReSellerIdBindingTests.Create_owner_as_real_gestor_links_the_actor_own_reseller_and_ignores_the_body_resellerId`
is now near-duplicate of
`OwnersCreateGestorAutoAssignTests.Create_owner_as_reseller_ignores_body_resellerId_and_links_the_actor_gestor`:
same actor shape, same body-ignored assertion, same link assertion. The only difference is
file location and naming. It is retained here rather than silently deleted; removal is the
user's call.

## Verification summary (final, observed)

| Run | Result |
| --- | --- |
| `dotnet test ...SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~E2ETests.Owners"` | Failed 0 / Passed 50 / Total 50 |
| `dotnet test ...Application.Tests.csproj` | Failed 0 / Passed 511 / Total 511 |
| vitest `owner-create.test.tsx` | 31 passed / 31, no type errors |

The full E2E project was not run, so there is no fresh whole-suite total to compare against
the 581 baseline. The known pre-existing failure
(`Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`)
was not touched and did not run.

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
6. ~~No existing E2E test modified~~ — SUPERSEDED: the user authorized replacing exactly one
   test, `OwnersCreateReSellerIdBindingTests.Create_owner_as_reseller_with_valid_resellerId_persists_reseller_owner_link`
   (see "Existing E2E test replaced" above). No other existing E2E test was modified; no
   Angular file was read or touched.
7. `dotnet test` and vitest results reported as observed, with any pre-existing failure
   named explicitly (a failing existing test is information, not an obstacle).

## Known pre-existing failure (not ours, do not touch)

`Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
(`SMCA.WebApi.E2ETests/Auth/AuthRegisterPlanTests.cs:131`) fails on `qa`: feature 91
leaks into a plan's store role features. Confirmed pre-existing by stashing the previous
unit's changes. Baseline: Failed 1 / Passed 580 / Total 581.

## Authorized scope for this change

Backend production: `CreateOwnerCommandHandler`. Frontend production: `owner-create.tsx`.
New E2E test file; new vitest cases in an existing frontend unit test file. Plus the ONE
existing E2E test replacement the user authorized mid-unit
(`OwnersCreateReSellerIdBindingTests.cs`, previous line 174). Anything else — any other
existing E2E test, `UpdateOwnerCommand`, the Playwright suite, Angular, or store creation —
means STOP and report.
