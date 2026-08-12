# Exploration — s1-01-registration-assertions

> Phase: sdd-explore · Date: 2026-08-11 · Mode: hybrid (OpenSpec + Engram)
>
> Branch: `feat/e2e-s1-01-registration-assertions` (even with `main` — zero diff).
> Sources audited: `docs/testing/e2e-stage-1/S1-01-backend.md`, `docs/testing/e2e-stage-1/S1-01.md`,
> `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterSuccessTests.cs`,
> `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs`,
> `Application/Features/Authentication/Commands/Register/RegisterCommand.cs`,
> `Infrastructure/Persistence/Repositories/ModuleRepository.cs`,
> `Infrastructure/Persistence/Repositories/ReSellerRepository.cs`,
> `Application/Services/Stores/CreateStoreService.cs`, `Application/Dtos/Authentication/AuthDto.cs`,
> `Domain/Entities/ReSellerOwners/ReSellerOwner.cs`, `Infrastructure/{AuthTestHelpers,DbTestHelpers,WebAppFixture}.cs`,
> `SMCA.WebApi/Controllers/v1/AuthController.cs`, git history, and a live test run.

## status

DONE-ALREADY-MERGED — the plan's work was already implemented, verified, archived and merged to `main`.
Nothing test-related remains to build; the only residual work is doc synchronization.

## executive_summary

**Headline finding: the 6 assertions this change was created to cover are ALREADY covered by a passing E2E file in `main`.**

- Commit `edcf7397` (2026-08-08, "test(e2e): assert S1-01 register data facts (ADD-ONLY)") created
  `backend/src/SMCA.WebApi.E2ETests/Auth/AuthRegisterDataAssertionsTests.cs` (309 lines, 6 `[Fact]`s —
  one per plan assertion) and flipped the 6 uncovered `[x]` checkboxes in `S1-01.md` to `[ ]` with a note.
- The full SDD cycle for that work ran under change name `e2e-stage-1-s1-01-backend` and is archived at
  `openspec/changes/archive/2026-08-07-e2e-stage-1-s1-01-backend/` (explore → propose → design → tasks →
  apply → **verify PASS 6/6** → archive-report). Merged into `main` via `af304402` (2026-08-09).
- I re-ran the 6 tests against the live database as part of this exploration:
  `dotnet test ... --filter "FullyQualifiedName~AuthRegisterDataAssertionsTests"` → **Passed 6 / Failed 0**. ✅
- Production code matches the plan's claims on all 6 points — no drift found (evidence table below).
- The current branch `feat/e2e-s1-01-registration-assertions` is **even with `main`** (`git diff main HEAD` is empty),
  so this change name has nothing to implement. Re-creating the test file would be duplicate work.
- **Residual (docs-only) gap**: `S1-01.md` still shows the 6 checkboxes as `[ ]` (lines 53-59) and its
  "Estado de cobertura" section (lines 63-66) does not list `AuthRegisterDataAssertionsTests.cs`; the note at
  line 61 points at the pre-merge branch name. `S1-01-backend.md` still declares the work "diferido" (line 3),
  which is now false. Both are stale after the merge.

**Requires authorization?** Nothing. The residual work is documentation only — no production source and no
existing E2E test would be touched. No `requires authorization` flags needed.

## Confirmed production-behavior map (6/6 verified against code, all covered by the existing test file)

| # | Assertion | Production code that produces it | Verifiable by reading DB after POST? | Covering test (`AuthRegisterDataAssertionsTests.cs`) |
|---|---|---|---|---|
| 1 | `owner.User.SelectedStoreId` == new store id | `RegisterCommand.cs:91` (`owner.User.SelectedStoreId = store.Id;`) | ✅ Yes — read `User.SelectedStoreId` for the login after 201 | `Register_sets_SelectedStoreId_to_new_store_id` (`:120-135`) |
| 2 | Owner description == `"Nombre de la tienda: " + storeName` | `RegisterCommand.cs:66-67` (description arg passed to `CreateOwnerAsync`) | ✅ Yes — read `Owner.Description` | `Register_composes_owner_description_from_store_name` (`:137-155`) |
| 3 | Store `description = "Tienda de prueba"`, `approved = false` | `RegisterCommand.cs:82-83` → `CreateStoreService.cs:36-43` (param order: `description`, `approved`) | ✅ Yes — read `Store.Description`/`Store.Approved` | `Register_creates_store_with_test_description_and_not_approved` (`:157-175`) |
| 4 | Store receives ALL `GetAvailableModulesToStore()` incl. paid (H-1) | `RegisterCommand.cs:70-83` (fetch + pass all ids); filter `ModuleRepository.cs:17-24`; `StoreModule` rows per id at `CreateStoreService.cs:46-61` | ✅ Yes — compare `StoreModule.ModuleId` set for the store vs runtime-derived expected set | `Register_assigns_all_available_modules_including_paid` (`:177-219`) — runtime-derived expected set, set equality + ≥1 paid precondition, no hardcoded counts |
| 5 | `AuthDto` carries NO refresh token | `RegisterCommand.cs:129-132` (`new AuthDto(login, token, expiresAt)` — refresh fields untouched); nullable defaults at `AuthDto.cs:3-8` | ✅ Yes — assert `body.Data.RefreshToken`/`RefreshTokenExpiresAt` are null | `Register_response_has_no_refresh_token` (`:221-254`) |
| 6 | Matching `code` creates a `ReSellerOwner` | `RegisterCommand.cs:93-120`; match `r.User.Login == code` at `ReSellerRepository.cs:34-40`; `ReSellerOwner.Create` copies discounts (`Domain/Entities/ReSellerOwners/ReSellerOwner.cs:27-32`) | ✅ Yes — read `ReSellerOwner` by `OwnerId` after 201 | `Register_with_reseller_code_creates_ReSellerOwner` (`:256-308`) — seeds ReSeller whose `User.Login == code`, asserts `ReSellerId`, discounts 0/25 copied, `TenantId` |

All 6 pass against the real database (fresh run, 2026-08-11).

## Findings where the plan doc does NOT match reality

1. **`S1-01-backend.md:3`** ("Trabajo diferido. Nada de acá se ejecuta sin decisión explícita del usuario")
   is stale: the work was executed on 2026-08-08 (commit `edcf7397`) within the plan's own additive rule
   (new file beside `AuthRegisterSuccessTests.cs` — no authorization required) and merged on 2026-08-09.
2. **`S1-01-backend.md:15-24`** ("ningún test E2E verifica"): true on 2026-08-07, false since 2026-08-08.
3. **`S1-01.md:53-59`**: the 6 checkboxes are `[ ]` with a note (line 61) referencing the pre-merge branch
   `e2e-stage-1-s1-01-backend`. After the merge the honest state is **covered** — checkboxes should be `[x]`
   citing `AuthRegisterDataAssertionsTests.cs` with the test-name column, and the note should be dropped/updated.
4. **`S1-01.md:63-66`** ("Estado de cobertura"): does not list `AuthRegisterDataAssertionsTests.cs` (only
   `AuthRegisterSuccessTests.cs:28`, `AuthRegisterValidationTests.cs:32-53`, `AuthRegisterDuplicateTests.cs:22`,
   `StoreCreationTrialTests.cs:331`). The new file is missing from the catalog.

No drift between production code and the plan's assertions was found — every claim the plan makes about
`RegisterCommand.cs` is still accurate.

## Investigation detail (requested points)

1. **Base test mirrored**: `AuthRegisterSuccessTests.cs` — `[Collection("e2e")]`, ctor `WebAppFixture`, registers
   via `POST /api/v1/auth/register` with `Code = null`, asserts 201 + envelope + `login`/`AuthToken`/`ExpiresIn`,
   then reads DB via `DbTestHelpers.GetUserByLoginAsync` + scoped `ApplicationDbContext` with `IgnoreQueryFilters()`,
   cleanup via `DbTestHelpers.CleanupTenantCascadeAsync` in `finally`. The new file follows this convention exactly
   (its `RegisterAsync` helper is a superset: also resolves `Owner` + `Store` and returns ids).
2. **Endpoint**: `AuthController.RegisterAsync` (`SMCA.WebApi/Controllers/v1/AuthController.cs:96-115`) —
   `[AllowAnonymous]`, `[EnableRateLimiting("RegisterPolicy")]` (rate limiter OFF under `Testing` env, `S1-01.md:42`),
   returns `201 Created` on success. Handler: `RegisterCommandHandler.Handle` (`RegisterCommand.cs:63-133`).
3. **Modules (H-1, #4)**: `ModuleRepository.GetAvailableModulesToStore()` (`ModuleRepository.cs:17-24`) filters
   `IsActive && AvailableToStore && Features.Any(f => f.IsActive && f.AvailableToStore)`, ordered `PriceIncluded` desc
   then `Order`. Handler passes ALL resulting ids to `CreateStoreAsync` (`RegisterCommand.cs:81-83`);
   `CreateStoreService` creates one `StoreModule` per id with price/discount copied from the module
   (`CreateStoreService.cs:46-61`). The test replicates the repository filter as the expected set
   (`AuthRegisterDataAssertionsTests.cs:188-205`), requires ≥1 paid module (`paidExpectedIds.NotBeEmpty()`
   precondition guard per CLAUDE.md), asserts set equality AND non-empty paid intersection — no hardcoded counts.
4. **ReSeller (#6)**: matched IN the register handler via `ReSellerRepository.GetByUserNameAsync(code)`
   (`ReSellerRepository.cs:34-40` — `r.User.Login == code`); on match, `ReSellerOwner.Create(reSeller.Id, owner.Id,
   reSeller.DiscountPrice, reSeller.PercentDiscountPrice, owner.TenantId)` (`RegisterCommand.cs:106-111`).
   The test seeds a `User` whose `Login == code` + `UserRole(ReSeller)` + `ReSeller` row
   (`AuthRegisterDataAssertionsTests.cs:102-118`), mirroring `RegisterStorePaymentTests.SeedReSellerWithStoreAsync`
   (`:42-56`) and `AuthLoginReSellerTests.SeedReSellerAsync` (`:47-59`). Cleanup order is FK-aware
   (ReSellerOwner → tenant cascade → ReSeller row → user), see `:279-307`.
5. **DB read pattern in the suite**: `DbTestHelpers.GetUserByLoginAsync` (`DbTestHelpers.cs:82-87`),
   scoped `ApplicationDbContext` + `IgnoreQueryFilters()` + `AsNoTracking()` for read-after-write, cleanup via
   `CleanupTenantCascadeAsync` (`:113-128`) / `CleanupUserAsync` (`:89-111`). `WebAppFixture` (`WebAppFixture.cs:8-40`)
   sets the `smca_test` connection string env var, builds `AppTestFactory`, applies migrations + `ResetDataAsync`
   per run. `[Collection("e2e")]` / `E2ECollection` defined at `WebAppFixture.cs:42-43`.
6. **Fixture**: anonymous client via `fixture.Factory.CreateClient()` — register needs no auth (endpoint is
   `[AllowAnonymous]`), so no `AuthTestHelpers.MintToken`/`BearerClient` needed for these tests.
7. **AUTH-INV-01 / B-3 login pattern**: `AuthLoginOwnerAdminTests` / `AuthLoginReSellerTests` /
   `AuthLoginStoreUserTests` use the same register/seed + login roundtrip. For #6 the new file's
   `SeedReSellerAsync` is consistent with `AuthLoginReSellerTests.SeedReSellerAsync` (`:47-59`: same
   `User.Create(login, hash, ..., login, tenantId)` + `UserRole` + `ReSeller.Create(user.Id, true, 0, 25, ...)`).
   No additional login-roundtrip value for this change — the assertion is about persisted state after register.

## Files that WOULD be created/modified if the change proceeds (docs-only, no authorization needed)

- `docs/testing/e2e-stage-1/S1-01.md` — flip the 6 checkboxes (lines 53, 54, 55, 56, 58, 59) back to `[x]`
  citing `Auth/AuthRegisterDataAssertionsTests.cs` + test names; add the file to "Estado de cobertura"
  (line 63-66); update/remove the stale note (line 61).
- `docs/testing/e2e-stage-1/S1-01-backend.md` — mark the plan as executed (commit `edcf7397`, merged `af304402`)
  and point at the archive `openspec/changes/archive/2026-08-07-e2e-stage-1-s1-01-backend/`.
- `openspec/changes/s1-01-registration-assertions/` — SDD artifacts for this change name (explore.md [this],
  plus proposal/spec/design/tasks/verify/archive if the user opts for a formal cycle).

NO test files would be created or modified — the E2E file already exists and passes in `main`.

## next_recommended

**Recommendation: do NOT write any test code. Close the change with doc-sync + archive.**

- **Option A (recommended)** — *Close with doc-sync*: no new tests; update the two stale docs
  (`S1-01.md`, `S1-01-backend.md`) to reflect that the 6 assertions are covered by
  `AuthRegisterDataAssertionsTests.cs` (proven by the 6/6 run above), then archive this change with a note
  pointing to the already-archived cycle `2026-08-07-e2e-stage-1-s1-01-backend`. Effort: Low.
- **Option B** — *No-op close*: archive this change without any file change, documenting that the work exists
  in `main`; defer doc sync to a separate docs change. Effort: Minimal, but leaves the stale catalog in place.
- **Option C (not recommended)** — *Re-run the formal SDD cycle for this change name* with the existing commit
  as implementation (propose → spec → design → tasks → verify → archive). Duplicates the archived cycle with
  zero new code value; only worth it if the user wants `s1-01-registration-assertions` to have its own artifact
  trail independent of `e2e-stage-1-s1-01-backend`.

**Ready for Proposal**: Yes — with the caveat that "proposal" should be a doc-sync/closure proposal, not an
implementation one.

## risks

- **Stale catalog misleads future audits**: `S1-01.md` checkboxes `[ ]` + missing coverage entry will make the
  next coverage audit re-discover "gaps" that are closed — the exact failure mode the plan itself criticized.
- **Duplicate implementation**: re-creating `AuthRegisterDataAssertionsTests.cs` on this branch would either
  conflict with `main` (file already merged) or produce a no-op move. Any such attempt must be stopped.
- **Known pre-existing suite failure (unrelated)**: full-suite runs include one pre-existing flake,
  `Billing/ToCollectTests.ReSeller_sees_own_stores_only` (documented in the archived verify-report) — untouched
  per CLAUDE.md; not caused by and not part of this change.
- **No production/authorization exposure**: nothing in the residual work requires touching production code or
  existing E2E tests, so the project's two non-negotiable rules are not triggered.

## skill_resolution

- Loaded: `sdd-explore` SKILL.md (in-context). `sdd-phase-common.md` was NOT found at the requested path
  (`C:\Users\Appollo\.config\opencode\skills\sdd-phase-common.md`); the shared reference lives at
  `C:\Users\Appollo\.config\opencode\skills\_shared\SKILL.md`. Sections B (retrieval) and C (persistence) applied
  per convention: hybrid mode — this file persisted under `openspec/changes/s1-01-registration-assertions/` AND
  Engram (topic_key `sdd/s1-01-registration-assertions/explore`, type `architecture`, capture_prompt false).
- Deliverable format per skill Step 6 applied; the skill's "only file you may create" rule honored — only
  `explore.md` was written, no code, no implementation files.
