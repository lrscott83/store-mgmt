# api-culture-always-spanish

- Status: closed
- Date: 2026-09-27
- Route: delegated direct (one writer) for the culture wiring; direct inline for the two
  authorized E2E assertion fixes, which were mechanical and fully understood.
- TDD: ENABLED and used. RED was observed before the production change: the Spanish
  assertion failed against the English response (`Failed: 1, Passed: 50, Total: 51`), then
  GREEN was observed after wiring the middleware (`Failed: 0, Passed: 51, Total: 51`).
- Commits: `36499fc1` (culture wiring + the authorized E2E file), plus the follow-up work-unit
  commit for the two `ToggleStorePlanTests` assertion fixes authorized after the fact.
- TDD note: the follow-up commit was a deliberate post-hoc assertion change with the user's
  explicit authorization, not a new RED→GREEN cycle. The failures were already observed.

## Objective

The API always answers in **Spanish**, and the duplicate/contradictory localization
configuration is resolved so the two copies can no longer disagree.

## Root cause (verified, not inferred)

`SMCA.WebApi/Program.cs` calls `AddLocalizationExtension()` (line 109) but **never**
`UseLocalizationExtension()`. The `RequestLocalizationMiddleware` is therefore absent from
the pipeline, so `IStringLocalizer` resolves against whatever `CurrentUICulture` the
process happens to have. **The API's language today depends on the machine's regional
settings** — Spanish on one host, English on another.

Two copies of `UseLocalizationExtension` exist, and they contradict each other:

| File | Default culture | Actually called? |
| --- | --- | --- |
| `SMCA.WebApi/Extensions/ServiceExtensions.cs:105` | `es` | **No — dead code** |
| `WebApi/Extensions/AppExtensions.cs:36` | `en` | Yes, but only from `WebApi/Startup.cs:89` |

`backend/src/WebApi/` is **not a project in `SMCA.sln`** — the solution contains Domain,
Application, Infrastructure, Resources, SMCA.WebApi, SMCA.Presentation, Application.Tests,
SMCA.WebApi.E2ETests, SMCA.PasswordHasher. So `WebApi` is a leftover from an older version:
not built, not deployed, unreachable. Its copy is the only one wired anywhere, and it says
`en`. That is the contradiction to resolve.

`WebApiTest/Extensions/ServiceExtensions.cs:97` also defines a copy (`es`); its call site
`WebApiTest/Program.cs:118` is commented out. Same dead-code situation.

The E2E host is `WebApplicationFactory<Program>` over `SMCA.WebApi`, so it inherits exactly
this defect — which is why the new `OwnerHasPayments` assertion in
`OwnersDeletePaymentsGuardTests` had to be written in English.

## Product decision (user)

"arreglalo para que sea español y arregla eso tambien de dos veces la configuracion y en dos
sitios distintos, siempre español y el texto del mensaje siempre en español"

- The API always answers in Spanish.
- The duplicated configuration is fixed, not left to disagree.
- The `OwnerHasPayments` message must be Spanish in every environment, including tests.

## Scope

### Backend production (IN)

1. **`SMCA.WebApi/Program.cs`** — call `app.UseLocalizationExtension()` in the pipeline.
   Place it after `UseRouting()` and **before** `UseMiddleware<ErrorHandlerMiddleware>()`,
   so the error handler formats messages under the resolved culture. Follow the ordering
   conventions already in that file; do not reorder unrelated middleware.

2. **`SMCA.WebApi/Extensions/ServiceExtensions.cs`** — harden `UseLocalizationExtension` so
   Spanish is guaranteed, not merely the default. Set `DefaultRequestCulture` to `es` AND
   restrict `SupportedCultures`/`SupportedUICultures` to `es` only, so an
   `Accept-Language: en` request header cannot flip the response to English. The
   `IStringLocalizer` then resolves `I18n.resx` (the neutral resource, whose values are
   Spanish) because no `I18n.es.resx` exists and the neutral resource is the fallback.

3. **`WebApi/Extensions/AppExtensions.cs`** — align the unreachable copy to the same
   hardened Spanish configuration, so the two copies can no longer state different things.
   **Do NOT delete the `WebApi` or `WebApiTest` projects.** They are not in the solution, so
   removing them is a destructive, separate decision the user has not made. Aligning is
   zero-risk; deleting is not. Report the leftover projects as a deletion candidate and let
   the user decide.

4. **Do not remove `I18n.en.resx`.** With the culture pinned to `es` it is simply never
   selected. Leaving it keeps the door open without affecting current behavior.

### Backend E2E — the COMPLETE authorized list (1 file)

**`Owners/OwnersDeletePaymentsGuardTests.cs`** — the message assertions at lines 68-73
currently demand English substrings:

```csharp
description!.ToLowerInvariant().Should().Contain("payment");
description.ToLowerInvariant().Should().Contain("deactiv");
```

The Spanish message is:

> El propietario tiene pagos registrados y no se puede eliminar. Desactívelo en su lugar.

So the assertions must demand the Spanish substrings (`pago`, `desactiv`), and the
`NotContain("An unexpected error occurred")` guard must be reviewed — the Spanish equivalent
of that generic-failure text is whatever the neutral resource holds; if the guard no longer
means anything in Spanish, replace it with the real Spanish generic-failure string from
`I18n.resx` rather than deleting the guard. Update the comment that says the message is
asserted in English on purpose — it is no longer true.

**NOT authorized:** any other E2E test. If the culture change breaks a test outside this
file, **STOP and report it** — do not modify it. Specifically watch
`Middlewares/ErrorHandlerMiddlewareTests.cs`, which asserts English strings like
`"Name is required"`, `"Invalid operation"` and `"User not found"`. Determine for each
whether the string is a literal in the test or actually resolved through `IStringLocalizer`;
only the latter can break. Report what you find either way.

Note: `Auth/AuthRegisterDataAssertionsTests.cs` already asserts Spanish
(`"Nombre de la tienda: {storeName}"`), so pinning the culture can only make it more
deterministic, never break it.

## Tasks

- [ ] T1 — RED: change `OwnersDeletePaymentsGuardTests` to demand the Spanish message.
      Run it and OBSERVE it fail against the current English response. Paste the output.
- [ ] T2 — GREEN: wire `UseLocalizationExtension()` into `SMCA.WebApi/Program.cs` and harden
      it to force Spanish. Re-run and observe it pass.
- [ ] T3 — Align the unreachable `WebApi/Extensions/AppExtensions.cs` copy to the same
      hardened Spanish configuration.
- [ ] T4 — Sweep: grep the E2E suite for assertions that depend on localized message text
      and report, per test, whether it is a literal or a resolved resource. Do not change
      anything outside `OwnersDeletePaymentsGuardTests.cs`.
- [ ] T5 — Verification, reported exactly as observed:
      - `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~E2ETests.Owners"`
      - **the full E2E project**, because this change affects every localized message in the
        API. Compare against the pre-existing baseline of Failed 1 / Passed 580 / Total 581
        and report every difference.
      - `dotnet test backend/src/Application.Tests/Application.Tests.csproj`
- [ ] T6 — Work-unit commit on `qa`.

## Acceptance criteria

1. `DELETE /api/v1/Owners/{id}` on an owner with payments answers `409` with the message
   "El propietario tiene pagos registrados y no se puede eliminar. Desactívelo en su lugar."
   — in the E2E host as well as in production.
2. The language does not depend on the host's regional settings: an `Accept-Language: en`
   request header does NOT produce an English response.
3. The two `UseLocalizationExtension` copies state the same thing, and the real API actually
   calls its own.
4. The full E2E suite shows no new failures beyond the pre-existing baseline. Any new failure
   is reported, not fixed silently.
5. No test outside `OwnersDeletePaymentsGuardTests.cs` is modified. The `WebApi` and
   `WebApiTest` projects are not deleted. No Angular file is read or touched.

## Known pre-existing failure — NOT ours, do not touch

`Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
fails on `qa` (feature 91 leaking into OwnerAdmin store role features). Already fixed on
another branch, to be merged here later. Do not investigate, do not modify, do not let it
block this unit.

## E2E suite fragility (recorded, not ours)

Repeated back-to-back E2E runs against the shared `smca_test` database poison it. Two
observed signatures: a `finally` cleanup failing with `23503` on
`FK_StorePayment_Store_StoreId` (leaving rows that make a later test fail with `23505` on
`IX_User_Login`), and `ResetDataAsync` itself dying with `23503` on `FK_Store_Owner_OwnerId`
— the reset statements are not transactional, so a failed reset leaves the `Store` table
already cleared and the next run starts from a different state. Both are pre-existing. If you
hit either, report it; never modify a test to accommodate it. Never compare test results
across a `git checkout` while using `--no-build`.

## Authorized scope for this change

Backend production: `SMCA.WebApi/Program.cs`, and the two
`UseLocalizationExtension` definitions in `SMCA.WebApi/Extensions/ServiceExtensions.cs` and
`WebApi/Extensions/AppExtensions.cs`. E2E: `Owners/OwnersDeletePaymentsGuardTests.cs` only,
plus the follow-up `Stores/ToggleStorePlanTests.cs` authorization recorded below.
Nothing else.

---

# Follow-up: the two tests the culture change broke

The culture change made two existing tests in `Stores/ToggleStorePlanTests.cs` fail. They
asserted the English substring `"inactive"` resolved from `I18n.en.resx`; with the culture
pinned to Spanish they now receive `"La tienda está inactiva"` and
`"El usuario propietario está inactivo"`. Both still assert `400`, which never changed.

**The subagent stopped and reported instead of touching that file** — correct, it was outside
the authorized scope. The user then authorized updating them.

| Test | Was | Now |
| --- | --- | --- |
| `Toggle_inactive_store_returns_400` | `Contains("inactive")` | `Contains("inactiva")` |
| `Toggle_with_inactive_owner_user_returns_400` | `Contains("inactive")` | `Contains("inactivo")` |

The accent-free stems were chosen deliberately: the accented `í` in `está` is a
source-encoding hazard, and the distinct `a`/`o` endings are what stop either test from
passing on the other's message. A bare `"inactiv"` prefix would wrongly satisfy both, so the
new assertions are strictly stronger than the ones they replace.

Note this file already mixed languages — `Toggle_unowned_store_returns_400` and
`Toggle_unknown_store_returns_400` asserted the Spanish `"Tienda no encontrada"`. The two
English assertions were the outliers, and the Spanish culture pinned them to the rest of the
file.

# Verification record — observed, not predicted

| Run | Result |
| --- | --- |
| E2E Owners filter | `Total 51 / Passed 51 / Failed 0` (parent-verified) |
| `ToggleStorePlanTests` | `Total 10 / Passed 10 / Failed 0` (parent-verified) |
| `Application.Tests` | `Total 511 / Passed 511 / Failed 0` |
| Full E2E, run 1 | `Total 586 / Passed 578 / Failed 8` |
| Full E2E, run 2 | `Total 586 / Passed 579 / Failed 7` |

**The full-suite number is noisy and cannot be read as a regression count.** Six failures are
stable across every run and are the pre-existing module-18 / feature-91 plan-matrix family:

- `PlanChangeMatrixTests.SuperAdmin_upgrades_gratis_to_superior_store_keeps_superior_modules_and_features`
- `PlanChangeMatrixTests.SuperAdmin_downgrades_vip_to_superior_store_keeps_superior_modules_and_features`
- `StorePlanCatalogTests.StorePlanModule_seed_matches_documented_plan_matrix`
- `FeatureSeedCoherenceTests.Seed_features_available_to_store_exist_active_and_available_in_database`
- `MeAfterOwnerPlanChangeTests.Me_follows_the_plan_across_superadmin_flips_with_same_owner_token`
- `MeModuleFeatureDeactivationTests.Me_deactivated_module_disappears_from_me_keeping_others_intact`

The remaining one or two differ between runs and are the documented `smca_test` residue, not
product failures. Every one of them passes in isolation:

- `UsersRolesTests` → `Total 11 / Passed 11`
- `AuthLoginDekWrapTests` → `Total 6 / Passed 6` (run-1 failure was `23503` on
  `FK_StoreModule_Store_StoreId`, "Key (StoreId) is not present in table Store" — a previous
  test's cleanup deleted the store this test's seeder then attached to)
- `AuthMeDeactivationTests` → `Total 2 / Passed 2` (its name contains "inactive" but it
  asserts only the 404 status and call count; it never touches message text, so the culture
  pin cannot affect it)

This flakiness is pre-existing and is the same family already recorded in
`owner-delete-payments-409.md`. It is not fixed here.

# Corrections to the earlier baseline claims

Two numbers in this document and in the delegation brief were wrong and are corrected here:

1. **The full E2E suite is 586 tests, not 581.** The subagent measured a real HEAD baseline of
   `6 failed / 580 passed / 586` by stashing the change and rebuilding — the old 581 figure
   predated this unit.
2. **`AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
   now PASSES on `qa`.** It was listed as a known pre-existing failure; it is not one. The
   outstanding feature-91 work is the plan-matrix family above, which is a different set of
   tests.

# Still open for the user to decide (not actioned)

- `backend/src/WebApi/` and `backend/src/WebApiTest/` are both absent from `SMCA.sln` and are
  unreachable dead weight. Their localization copies were aligned so they can no longer
  contradict the live API, but **deleting the projects was not authorized and was not done**.
- `I18n.en.resx` is retained and is now never selected. Keeping it is harmless and reversible.
- `WebApiTest/Extensions/ServiceExtensions.cs` is a third copy of `UseLocalizationExtension`
  whose only call site (`WebApiTest/Program.cs:118`) is commented out. It already said `es`
  and was left untouched.
