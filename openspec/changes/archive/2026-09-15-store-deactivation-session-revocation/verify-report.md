```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b722d9812c602dd7d11de59171f5e624a23002df7967bb7c48307e964a321711
verdict: pass
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 16/16
test_command: dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --nologo --filter "FullyQualifiedName~StoreDeactivationSession|FullyQualifiedName~AuthMeBlacklistParity"
test_exit_code: 0
test_output_hash: sha256:19e7d2ba9bb8b04dbfe6501c9bb78bdf3fb705a32bc3e40a985c6de69f048e19
build_command: dotnet build backend/src/SMCA.sln --nologo -v q
build_exit_code: 0
build_output_hash: sha256:6558011e933f42ddc12493606b04ef419dcec0dd19ef847cc2bbfe47e4cf592d
```

## Verification Report

**Change**: store-deactivation-session-revocation
**Phase**: Verify
**Date**: 2026-09-15
**Mode**: Inline orchestrator execution (user override: "no delegues nada y hazlo todo tu mismo inline")
**Branch**: qa @ 18a22a74 (5 commits: 9e7b7fb4 revocation service+repos, 98dd10fe handler hooks+refresh matrix, 8fa84720 GetMe parity+E2E, 82c5103f SDD artifacts, 18a22a74 tasks complete+apply progress)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 23 (tasks.md 1.1–1.5, 2.1–2.5, 3.1–3.3, 4.1–4.x, 5.1–5.5, 6.1–6.2) |
| Tasks complete | 23 (all `[x]`; every task artifact verified present in the tree) |
| Tasks incomplete | 0 |

### Build & Tests Execution

All commands executed fresh during this verify phase (not inherited from apply).

| Command | Exit | Result | Output hash |
|---|---|---|---|
| `dotnet build backend/src/SMCA.sln --nologo -v q` (declared `build_command`) | 0 | 0 errors | `sha256:6558011e…cf592d` |
| `dotnet test backend/src/Application.Tests/Application.Tests.csproj --nologo` | 0 | 470/470 passed (2s) | `sha256:59b4bd5a…a6ba3d` |
| `dotnet test backend/src/Domain.UnitTests/Domain.UnitTests.csproj --nologo` | 0 | 22/22 passed | `sha256:3721be27…ab9cce` |
| `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --nologo --filter "FullyQualifiedName~StoreDeactivationSession\|FullyQualifiedName~AuthMeBlacklistParity"` (declared `test_command`) | 0 | 6/6 passed (4 session-revocation + 2 blacklist parity) | `sha256:19e7d2ba…f048e19` |
| `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --nologo` (full suite) | 0 | 506/506 passed (1m46s; existing AuthMeInactiveStoreOwner, StoreActivation A-04/A-13, login suites all green) | `sha256:1880b715…ae4fb` |

**Coverage**: ➖ Not available (no coverage threshold configured in this repo).

### Spec Compliance Matrix

Specs: 3 delta files, **6 requirements / 16 scenarios** (counted from `### Requirement:` / `#### Scenario:` headers in the deltas).

| Requirement | Scenario | Covering test | Result |
|---|---|---|---|
| NEW Deactivation Revokes Affected Users' Refresh Tokens | Only active store deactivated | `StoreDeactivationSessionTests.Deactivating_only_store_revokes_owner_and_store_user_sessions` — both tokens revoked same transaction, refresh 401, login 403 until reactivation, re-login OK, old token stays dead | ✅ COMPLIANT |
| NEW Deactivation Revokes Affected Users' Refresh Tokens | Non-last store isolation | `StoreDeactivationSessionTests.Having_more_than_one_active_store_keeps_sessions_of_non_deactivated_stores` — deactivated store's user 401, other store's user refresh OK | ✅ COMPLIANT |
| NEW Deactivation Revokes Affected Users' Refresh Tokens | Idempotent same-value flip does not revoke | `StoreDeactivationSessionTests.Same_value_deactivation_is_idempotent_no_extra_token_damage` (SuperAdmin-driven; A-13 semantics 200/200) | ✅ COMPLIANT |
| NEW Deactivation Revokes Affected Users' Refresh Tokens | Reactivation does not resurrect tokens | `Deactivating_only_store…` re-login asserts NEW token; old refresh still 401 | ✅ COMPLIANT |
| NEW Refresh Enforces Activation State | Inactive store refresh rejected | `RefreshCommandHandlerTests` matrix — inactive store → 401 `Store.Inactive` + presented token revoked | ✅ COMPLIANT |
| NEW Refresh Enforces Activation State | Inactive user refresh rejected | matrix — inactive user → 401 `Auth.AccountInactive` + revoked | ✅ COMPLIANT |
| NEW Refresh Enforces Activation State | Active path unaffected | matrix — active user/store/owner → rotation intact (R2 contract) | ✅ COMPLIANT |
| NEW /me Blacklists on Store/Owner-Inactive Verdicts | Second /me call after store-inactive verdict | `AuthMeBlacklistParityTests.Deactivating_store_then_me_returns_401` — 404 verdict → 401 on second call | ✅ COMPLIANT |
| NEW /me Blacklists on Store/Owner-Inactive Verdicts | Owner-inactive parity | `AuthMeBlacklistParityTests.Deactivating_owner_then_me_returns_401` | ✅ COMPLIANT |
| NEW Deactivation Blast Radius Boundary | Owner self-revocation on only store | `Deactivating_only_store…` — owner (SelectedStoreId) + store user (employment) both in radius, revokes both, login blocked until reactivation | ✅ COMPLIANT |
| NEW Deactivation Blast Radius Boundary | Offline users out of scope | `StoreSessionRevocationServiceTests` — revocation targets RefreshToken rows only; offline roster users have no tokens; service union = SelectedStoreId ∪ StoreUser (distinct) | ✅ COMPLIANT |
| MODIFIED Deactivation Logs Out Store Users Passively (active-store-selection) | Store user of deactivated store dies on next /me | Existing `AuthMeInactiveStoreOwnerTests` untouched, green in 506/506; + implementation now revokes proactively (superset: stronger than passive) | ✅ COMPLIANT |
| MODIFIED Deactivation Logs Out Store Users Passively | Refresh token dies at deactivation time | `Deactivating_only_store…` refresh 401 immediately after deactivation (no /me needed) | ✅ COMPLIANT |
| MODIFIED Deactivation Logs Out Store Users Passively | No store-keyed blacklist infrastructure | Implementation uses RefreshToken row staging (RevokedAt), no blacklist table added; `StoreSessionRevocationServiceTests` bulk revoke staging | ✅ COMPLIANT |
| MODIFIED R4: Failure paths must not save (refresh-token-persistence) | Invalid refresh token fails without saving | Existing refresh failure tests green (470/470); no save on invalid-token path | ✅ COMPLIANT |
| MODIFIED R4: Failure paths must not save | Activation-state failure revokes and saves | matrix inactive-store/owner/user tests assert `IRefreshTokenRepository.Update` called (revoke persisted) — R4 carve-out delta applied | ✅ COMPLIANT |

### Findings

No CRITICAL, no WARNING, no SUGGESTION raised.

### Notes

- E2E suite grew 500 → 506 with zero existing tests modified (untouchable E2E rule respected; additive files only).
- Spec conflict resolved during design: `refresh-token-persistence` R4 blanket "failure paths must not save" is intentionally carved out for activation-state failures (revoke + save) via the MODIFIED delta in this change.
- Latent pre-existing bug documented (not introduced, not fixed here): `RefreshToken.IsActive` is an unmapped computed property (`!IsExpired && !IsRevoked`) — EF cannot translate it in a `Where()`. The new bulk query `GetActiveByUserIdsAsync` avoids it with a translatable predicate (`RevokedAt == null && ExpiresAt > now`), matching `GetUserIdsBySelectedStoreId…` shape.
- SDD runtime: apply attempt settled `passed` (evidence `sha256:b722d981…`, 1544 changed lines vs explicit 1200 → maintainer-approved reset, actor Appollo); verify attempt `sha256:7c6e234f…` in progress.