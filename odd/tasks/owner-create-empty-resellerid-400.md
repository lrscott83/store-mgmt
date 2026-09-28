# owner-create-empty-resellerid-400

- Status: done
- Date: 2026-09-26
- Commit: `ded38c80` on `qa` — "fix(owners): accept empty reSellerId string on owner create"
  (4 files, +441/-1: command, converter, new E2E test file, this doc)
- Route: delegated direct (one writer: converter + command attribute + new backend E2E tests)
- Authorization: user approved — "dale, cubre con tests haciendo TDD, pero adiciona los
  tests e2e necesarios para cubrir esto solo en el backend". Production backend
  change explicitly authorized for THIS scope. E2E coverage restricted to the
  backend suite (`SMCA.WebApi.E2ETests/`); no Playwright tests in this unit.
- TDD: ENABLED by explicit user instruction. Runner: `dotnet test`. RED before
  implementation, then GREEN, then REFACTOR. No invented evidence.

## Objective and problem

A Gestor (ReSeller) cannot create an owner. `POST /api/v1/owners` returns 400:

```json
{
  "status": 400,
  "errors": {
    "command": ["The command field is required."],
    "$.reSellerId": ["The JSON value could not be converted to
      Application.Features.Administration.Owners.Commands.CreateOwner.CreateOwnerCommand.
      Path: $.reSellerId | LineNumber: 0 | BytePositionInLine: 170."]
  }
}
```

**Both errors are ONE cause.** `$.reSellerId` is the real fault;
`command: The command field is required.` is collateral — when the body fails to
deserialize, the `[FromBody] command` parameter stays null and the non-nullable
record trips required validation. Fixing `reSellerId` clears both.

## Root cause

`CreateOwnerCommand.ReSellerId` is `Guid?` and the body is read by
`System.Text.Json`. An **empty string `""` is not convertible to `Guid?`** in a
JSON body and throws. The React client always serializes the field:

- `frontend-react/.../admin/owners/routes/owner-create.tsx:34` — state init `''`.
- `owner-create.tsx:134` — the `<select>` renders only when `isSuperAdmin`, so for
  a Gestor it never renders and the value stays `''`.
- `owner-create.tsx:89-97` — `createOwner` is called unconditionally with `reSellerId`.
- `frontend-react/.../admin/owners/lib/services/owner-http-service.ts:11,35-37` —
  typed `string`, POSTed verbatim; no omit-when-empty. `api-client.ts` interceptors
  only drive loading state, never transform the payload.

`""` binds to null for query/form values (`SimpleTypeModelBinder`) but NOT for a
JSON body. Earlier analysis in this session wrongly assumed the query/form rule
applied here; the 400 above disproves it.

## Why the suites missed it

- E2E `Create_owner_as_reseller_returns_201`
  (`Owners/OwnersCreateGapTests.cs:29`) posts `ReSellerId = (Guid?)null` (JSON
  `null`), which converts fine. `""` is never exercised.
- Unit `owner-create.test.tsx:387` mocks `ownerHttpService.createOwner` and asserts
  `expect.objectContaining` over 5 fields — `reSellerId` is never asserted, so the
  serialized JSON shape is never validated.

## Scope

- **Backend (authorized, IN):** make `CreateOwnerCommand` tolerate an empty or
  whitespace `reSellerId` as "no Gestor". Prefer a narrow, targeted fix
  (a `JsonConverter<Guid?>` applied to that one property) over a global
  serializer-options change, to keep the blast radius at one endpoint.
- **Backend E2E (authorized, IN):** NEW test file under
  `backend/src/SMCA.WebApi.E2ETests/Owners/`. Adding new E2E tests is allowed.
  Existing E2E tests must NOT be modified, deleted, renamed, skipped or weakened.
- **Frontend (OUT this unit):** the client still sends `""`; the backend fix makes
  that tolerated. Not changed here — user scoped this unit to the backend.
- **Angular `frontend/` (FORBIDDEN):** legacy, never read, never touched.
- **Out of scope (open follow-ups, NOT in this unit):**
  - P1 — `owner-create.tsx:104` navigates to `/management/stores/create`, whose
    `clientLoader` is `ownerStoresGate()` → `adminLoader()`
    (`auth/routes/loaders.ts:124-133`) admits only SuperAdmin||OwnerAdmin, so a
    Gestor gets `logout()` + redirect `/login` right after a successful create.
  - P2 — product parity asked for in the original report: the created owner is
    never auto-assigned the creating Gestor. `IReSellerRepository
    .GetByUserIdIgnoreQueryFiltersAsync(userId)` already exists to derive it
    (`IReSellerRepository.cs:10`); `RegisterCommand.cs:109-136` is the model.
  - `UpdateOwnerCommand.ReSellerId` has the SAME latent `""` defect on
    `PUT /api/v1/owners/{id}` (`owner-edit.tsx:213` sends `''` for non-SuperAdmin).
    NOT fixed here — changing the update contract is a separate decision.

## Tasks

- [x] T1 — RED: new backend E2E test posts `reSellerId: ""` to `/api/v1/owners`
      as a ReSeller actor and expects 201 (not 400). Observe it FAIL.
- [x] T2 — GREEN: implement the narrow fix so the empty string binds to null.
- [x] T3 — REFACTOR: tidy, keep the change minimal and consistent with the
      project's layering; no speculative abstraction.
- [x] T4 — Add a second E2E case proving an omitted `reSellerId` still works and
      that a VALID Guid still links the `ReSellerOwner` row (no regression to
      the working path).
- [x] T5 — Run `dotnet test` on the backend E2E project and Application.Tests;
      report observed results honestly.
- [x] T6 — Work-unit commit on the feature branch, tests included.

## Implementation evidence

- Fix: `NullableGuidJsonConverter` (new, same folder as the command) applied with
  `[property: JsonConverter(typeof(NullableGuidJsonConverter))]` on
  `CreateOwnerCommand.ReSellerId`. Property-level only — global
  `JsonSerializerOptions` / `AddControllers` untouched. `""`/whitespace → null;
  a non-empty non-Guid string still throws `JsonException` → 400.
- Tests: new file `backend/src/SMCA.WebApi.E2ETests/Owners/OwnersCreateReSellerIdBindingTests.cs`
  (5 cases: `""` 201, omitted 201, null 201, valid Guid 201 + `ReSellerOwner` row,
  invalid string 400). No existing E2E test touched.
- RED (before the fix, filter `OwnersCreateReSellerIdBindingTests`):
  `Failed: 1, Passed: 4, Total: 5` —
  `Create_owner_as_reseller_with_empty_resellerId_string_returns_201` failed with
  `Expected r.StatusCode to be HttpStatusCode.Created {value: 201}, but found
  HttpStatusCode.BadRequest {value: 400}`.
- GREEN (same filter, after the fix): `Passed: 5, Total: 5`.
- `dotnet test ...E2ETests.csproj --filter "FullyQualifiedName~E2ETests.Owners"`:
  `Passed: 46, Total: 46`.
- `dotnet test Application.Tests/Application.Tests.csproj`: `Passed: 511, Total: 511`.
- Full E2E project: `Failed: 1, Passed: 580, Total: 581`. The one failure is
  **pre-existing and unrelated**:
  `Auth/AuthRegisterPlanTests.Register_generates_store_role_features_for_mapped_plan_features`
  — `Expected srfFeatureIds {...} to not contain {36, 37, 38, 39, 91, 120, 121},
  but found {91}`. Reproduced with these changes stashed (`git stash -u`), so it
  is not caused by this work unit. NOT modified.
- Parent spot check (independent re-run, not delegated): `dotnet test
  backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter
  "FullyQualifiedName~OwnersCreateReSellerIdBindingTests"` → `Passed: 5, Total: 5`,
  0 failed. Confirms the delegated GREEN result on the committed tree. Target
  framework net8.0 (so `Utf8JsonReader.TryGetGuid` is available).

## Acceptance criteria

1. `POST /api/v1/owners` with `"reSellerId": ""` returns 201, not 400.
2. The same request with a valid Guid still creates the `ReSellerOwner` link.
3. The same request with `reSellerId` omitted or JSON `null` still returns 201.
4. No existing E2E test modified; no Angular file read or touched.
5. `dotnet test` results reported as observed, including any pre-existing failures
   named explicitly (a failing existing test is information, not an obstacle).

## Authorized scope for this change

Backend production code: `CreateOwnerCommand` and one new converter type, plus a
new E2E test file. Nothing else. Any need to widen this — touching an existing
E2E test, the update command, the frontend, or Angular — means STOP and report.
