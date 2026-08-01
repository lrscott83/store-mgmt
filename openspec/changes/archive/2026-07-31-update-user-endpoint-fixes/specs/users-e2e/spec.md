# Delta for users-e2e: UsersUpdateTests — 6 New Tests (RED → GREEN)

**Domain**: `users-e2e` — `UsersUpdateTests.cs`
**Change**: `update-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## ADDED Requirements

### Requirement: E2E-U1 — IDOR: StoreUser+Profile Editing Another User → Envelope 404 (RED → GREEN)

`UsersUpdateTests` MUST add a test where a StoreUser WITH the Profile feature (`AuthzSeed.SeedStoreUserAsync((int)FeatureType.Profile)`) PUTs a DIFFERENT user's id. Expected: HTTP 200 + envelope `ActionCode=404` (`succeeded=false`). MUST be RED today (currently returns 200 `data:true` — the existing filter-403 test cannot catch this actor) and GREEN after CH-U1. Actor ≠ target to avoid EF fixup masking.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | RED before fix | StoreUser+Profile actor; target ≠ actor | PUT other user `{FullName}` | (Today) 200 `succeeded:true` — assertion fails |
| 1b | GREEN after fix | Same setup | PUT other user `{FullName}` | HTTP 200; envelope `succeeded:false`; ActionCode 404 |

### Requirement: E2E-U2 — Partial Body Preserves Email and CellPhone (RED → GREEN)

A test where SuperAdmin → DIFFERENT user, body `{FullName}` only. MUST assert HTTP 200 AND target's Email/CellPhone unchanged. RED today (silently nulled), GREEN after CH-U2.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | RED before fix | Body omits email/cellPhone | PUT `{FullName}` | Email/CellPhone nulled — assertion fails |
| 2b | GREEN after fix | Same setup | PUT `{FullName}` | HTTP 200; Email/CellPhone unchanged |

### Requirement: E2E-U3 — Empty String Clears CellPhone (RED → GREEN)

A test where SuperAdmin → DIFFERENT user, body `{FullName, cellPhone: ""}`. MUST assert HTTP 200 AND target CellPhone becomes null.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Clear applied | Target has non-null CellPhone | PUT `cellPhone: ""` | HTTP 200; CellPhone == null |

### Requirement: E2E-U4 — Omitted IsActive Never Deactivates (RED → GREEN)

Two tests: (a) StoreUser+Profile → self, body `{FullName}` only → IsActive unchanged; (b) SuperAdmin → DIFFERENT user, body `{FullName}` only → IsActive unchanged. (b) is RED today (silently deactivates); both GREEN after CH-U4.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 4a | Non-admin self | Active StoreUser+Profile edits self | PUT omits isActive | HTTP 200; IsActive still true |
| 4b | Admin target | Active target; SuperAdmin edits | PUT omits isActive | HTTP 200; IsActive still true (RED today: false) |

### Requirement: E2E-U5 — Explicit isActive:false as Admin Deactivates

A test where SuperAdmin → DIFFERENT user, body `{FullName, isActive: false}`. MUST assert HTTP 200 AND target IsActive == false.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 5a | Admin toggle | Active target | PUT `isActive: false` | HTTP 200; IsActive == false |

### Requirement: E2E-U6 — Legit OwnerAdmin Edits Staff User → 200

A test where OwnerAdmin actor → a DIFFERENT staff user (actor ≠ target), body `{FullName}`. MUST assert HTTP 200 + envelope `succeeded:true` — proves the CH-U1 guard does not block legit admin edits. (Existing `Update_as_owner_admin_returns_200` targets self; this new test uses a distinct target.)

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 6a | Admin legit path | OwnerAdmin actor; staff target ≠ actor | PUT `{FullName}` | HTTP 200; `succeeded:true` |

## MODIFIED Requirements

### Requirement: E2E-U7 — Pending Archive Alignment: users-e2e R3 Non-Existent Id → 400 + IDOR Row

(Pending at ARCHIVE time — the main spec MUST NOT change in this change; mirrors the GET change's E2E-G3 pattern.)

The main spec R3 row "Non-existent id | SuperAdmin | 404" contradicts the contract (400 via validator `ValidationException`) and the existing test `Update_nonexistent_id_returns_400` (asserts 400). At archive: (1) that row MUST be aligned to 400; (2) an IDOR row ("Update other user as StoreUser+Profile → 200 + envelope ActionCode 404") MUST be added to R3. R3's existing "Update as StoreUser → 403" row refers to StoreUser WITHOUT the Profile feature (filter-level 403) — unchanged.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 7a | Contract holds | Non-existent id PUT | `Update_nonexistent_id_returns_400` runs | Returns 400 (unchanged) |
| 7b | Archive alignment | This change archived | users-e2e main spec updated | R3 "Non-existent id" row reads 400; IDOR row added |

## Verification Criteria

- [ ] 6 new tests FAIL on pre-fix code, PASS after fixes (E2E-U1 proves the IDOR the 403 test can't)
- [ ] All 6 existing `UsersUpdateTests` still pass (status-only assertions — D2/D4 change no asserted behavior)
- [ ] Regression: `dotnet test` — UsersListTests | UsersUpdateTests
- [ ] Main users-e2e spec untouched during this change (R3 alignment deferred to archive)
