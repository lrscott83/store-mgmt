# owner-delete-payments-409

- Status: complete
- Date: 2026-09-27
- Route: delegated direct (one writer: backend handler + i18n + React delete flow + E2E)
- TDD: ENABLED by explicit user instruction (carried across this session). Backend runner:
  `dotnet test`; frontend runner: vitest + tsc via `pnpm --filter @store-mgmt/web-store-pos`.
  RED before implementation, then GREEN. Never invent output.

## Objective

A store owner that has a store with payments **cannot be physically deleted — only
deactivated**. The delete must be refused with a clear `409 Conflict`, and **nothing at all
may be deleted** — not the owner, not the user, not the store, not the payments.

## Product decisions (settled with the user, verbatim intent)

1. **Reject with a clear error.** Not a 500. Not a silent soft-delete. The caller sees a
   readable reason and the owner is left exactly as it was.
2. **Validate BEFORE deleting anything.** "Si no se puede borrar no se borra nada de nada,
   se muestra error y ya." Today the handler queues a hard-delete cascade and the database
   explodes mid-way. The check must run before the first delete is queued, not rely on a
   rollback.
3. **Status code: `409 Conflict`.** Semantically right (the resource exists but cannot be
   acted on in the requested way given its current state) and already used in this codebase
   for duplicate login.
4. **Deactivation already exists.** `UpdateOwnerCommand` already carries `IsActive` and
   applies it. No new endpoint is needed — refusing the delete is the whole change.
5. **Scope of the guard: payments.** The user specified payments. The two sibling tests
   that today expect a 500 for a *self-reseller link* and for *refresh tokens* are NOT in
   this change and must keep their current behavior.
6. **Backend AND the React app.** The delete screen must show a clear message instead of a
   generic error.

## Root cause

`DeleteOwnerCommandHandler.Handle` performs a hard-delete cascade with no precondition
check: ReSellerOwner, UserRoles, StoreUsages, per-store StoreUsers / StoreModules /
StoreRoleFeatures / StoreUsages / Store, then Owner, User, Tenant. It never checks whether
anything financial is attached. With a `StorePayment` row referencing the store, the
`DeleteBehavior.Restrict` FK throws and the request surfaces as a 500.

EF's transaction currently rolls the cascade back, so nothing is persisted — but that is
incidental, not designed. The requirement is an explicit up-front check.

## Scope

### Backend production (IN)
- `DeleteOwnerCommandHandler` — before the first `HardDeleteAsync`, check whether any of the
  owner's stores has a `StorePayment`. If yes, throw `ApiException(localizer[key],
  HttpStatusCode.Conflict)`. **Nothing else changes** in the cascade, the 404 for a missing
  owner, or the logging.
- The i18n resource(s) — add a readable message key in the locales the project uses. Match
  the existing key style in that file. Do NOT invent a new localization framework.
- A repository query for the check. Prefer the smallest addition consistent with existing
  repository patterns (an `Any...Async` over `StorePayment` scoped to the owner's store ids).
  Do not speculatively refactor `GetOwnerWithAllDataToDeleteByIdAsync`.

### Frontend React (IN)
- The owner delete flow under `frontend-react/apps/web-store-pos/app/admin/owners/`. Find
  where the delete request is issued and where its failure is surfaced. On `409`, show a
  clear, specific message that the owner has payments and must be deactivated instead — in
  the same user-facing style the app already uses for other API errors. Add a vitest case
  for it. Do not restructure the owners feature.

### Backend E2E (IN — this file list is the COMPLETE authorized set)

**DELETE (1 test):**
- `OwnersCreateReSellerIdBindingTests.Create_owner_as_real_gestor_links_the_actor_own_reseller_and_ignores_the_body_resellerId`
  — a verified duplicate of `OwnersCreateGestorAutoAssignTests.Create_owner_as_reseller_ignores_body_resellerId_and_links_the_actor_gestor`
  (same setup, same body, same three assertions). User approved removal. Removing it must
  also remove any helper in that file that becomes unused, and must NOT touch the other four
  tests in that file.

**MODIFY to expect 409 + assert nothing was deleted (1 test):**
- `OwnersDeleteReferencesTests.Delete_owner_with_store_payments_does_not_cascade` — today
  asserts `500`. Must become: `409`, a readable message, and explicit assertions that the
  Owner, the User, the Store and the StorePayment rows are ALL still present afterwards.
  That last part is the real proof of "no se borra nada de nada".

**MODIFY to mount a complete Gestor (5 tests):**
These use `DbTestHelpers.SeedUserWithRoleAsync(ReSeller)`, which writes only `User` +
`UserRole` and no `ReSeller` row — a half-Gestor production cannot create
(`CreateReSellerCommand` always writes `User` + `ReSeller` + `UserRole` together). User
approved fixing all five:
- `OwnersCreateGapTests.Create_owner_as_reseller_returns_201`
- the four previous-unit tests in `OwnersCreateReSellerIdBindingTests` covering the empty
  string, the omitted field, JSON `null`, and the invalid string.

Each must additionally seed a real `ReSeller` row for the actor, and its `finally` must clean
up that row. Follow the cleanup shape already used in
`OwnersCreateGestorAutoAssignTests.DeleteReSellerRowsAsync`.

**NEW E2E file (allowed, preferred):** put the 409 + nothing-deleted acceptance coverage in
a NEW file under `backend/src/SMCA.WebApi.E2ETests/Owners/`. Do not pile new cases onto an
existing file.

**NOT authorized — touching any of these means STOP and report:**
- `Delete_owner_with_own_reseller_links_returns_500` and
  `Delete_owner_with_refresh_tokens_cleans_or_leaves_orphans` (self-reseller link and
  refresh tokens are out of scope; they keep their current behavior).
- `Auth/AuthRegisterPlanTests` — the feature-91 leak is already fixed on another branch and
  will be merged here later. Leave it alone entirely.
- The Playwright suite `frontend-react/e2e/`.
- `frontend/` (Angular) — never read, never touched.
- `UpdateOwnerCommand`, `CreateOwnerCommand`, and anything outside owner deletion.

### Frontend unit tests (IN)
Add vitest cases to the existing owner test files under
`frontend-react/apps/web-store-pos/app/admin/owners/`. These are vitest, not the Playwright
E2E suite, so they are not covered by the E2E-untouchable rule.

## Tasks

- [x] T1 — RED: new E2E file. A SuperAdmin deletes an owner whose store has a payment →
      `409`, readable message, and Owner + User + Store + StorePayment all still present.
- [x] T2 — RED: new E2E file. An owner with no payments still deletes successfully (no
      regression from the new guard).
- [x] T3 — GREEN: the up-front payments guard + the i18n key.
- [x] T4 — MODIFY `Delete_owner_with_store_payments_does_not_cascade` per above.
- [x] T5 — DELETE the duplicate test from `OwnersCreateReSellerIdBindingTests`.
- [x] T6 — RED then GREEN: frontend shows a clear message on 409.
- [x] T7 — MODIFY the 5 half-Gestor tests to mount a complete Gestor.
- [x] T8 — Run and report as observed: the E2E Owners filter, `Application.Tests`, and the
      frontend vitest + typecheck.
- [x] T9 — Work-unit commit on `qa`.

## Acceptance criteria

1. DELETE on an owner with a store that has payments → `409` with a readable message.
2. After that `409`, the Owner, its User, its Store and its StorePayment rows are all still
   present. Nothing is deleted.
3. The guard runs before any delete is queued — not by relying on a rollback.
4. DELETE on an owner with no payments still succeeds, exactly as before.
5. The self-reseller-link and refresh-token cases behave exactly as they do today.
6. The React delete flow shows a specific, clear message on `409`.
7. No test outside the authorized list above is modified, deleted, renamed, skipped or
   weakened. No Angular file is read or touched.
8. `dotnet test` and vitest results reported exactly as observed, with any pre-existing
   failure named explicitly.

## Known pre-existing failure — NOT ours, do not touch

`Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
fails on `qa` (feature 91 leaks into an OwnerAdmin's store role features). The user states it
is already fixed on another branch and will be merged here later. Do not investigate, do not
modify, do not let it block this unit.

## E2E suite fragility (recorded, not ours)

Repeated back-to-back E2E runs against the shared `smca_test` database eventually poison it:
a `finally` cleanup fails with `23503` on `FK_StorePayment_Store_StoreId`, leaving rows that
make a later test fail with `23505` on `IX_User_Login`. Measured as pre-existing — the
baseline commit ran 5/5 green. Never compare test results across a `git checkout` while
using `--no-build`; a stale DLL silently reports the baseline's results.

## Authorized scope for this change

Backend production: `DeleteOwnerCommandHandler`, the i18n resource for the new message, and
the minimal repository query for the check. Frontend production: the owner delete flow under
`app/admin/owners/`. E2E: exactly the 1 deletion + 1 modification + 5 modifications listed
above, plus new files. Anything else means STOP and report.
