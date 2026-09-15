# Apply Progress — store-deactivation-session-revocation

- lineage_id: `store-deactivation-session-revocation`
- generation: 1
- batch: 1 (single-batch apply; no prior progress existed)
- status: all 23 tasks complete, 4 work-unit commits created on `qa`
- artifact store: openspec (files in this folder mirror engram observations)

## Verdict

**Apply complete.** Deactivating a store now revokes the active refresh-token
sessions of every affected user (SelectedStoreId or employment), and refresh
hardening rejects stale tokens when user/store/owner go inactive — proven by
unit, domain and E2E suites (998 tests, all green).

## Work Units (commits on `qa` — direct-to-branch, no PRs per user decision)

1. `9e7b7fb4` — `feat(auth): revoke sessions of a store's users when it is deactivated`
   (revocation service + repo layer + DI; 10 new unit tests green)
2. `98dd10fe` — `feat(auth): revoke active sessions on activation-state flip and reject stale refresh tokens`
   (hooks in SetStoreActivation/DeactivateStore/UpdateStore + RefreshCommand activation matrix; 470/470 unit green)
3. `8fa84720` — `feat(auth): blacklist refresh token on inactive-store and inactive-owner GetMe paths`
   (GetMeQuery blacklist parity + 6 new E2E tests, filtered 6/6 green)
4. `82c5103f` — `docs(sdd): add store-deactivation-session-revocation change artifacts`
   (exploration, proposal, design, tasks, 3 delta specs)

## Task Status

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 RED GetUserIdsBySelectedStoreIdIgnoreQueryFiltersAsync contract test | done | RED observed in new `UserRepositorySelectedStoreIdTests` |
| 1.2 GREEN IUserRepository + UserRepository method | done | 6/6 repo tests green |
| 1.3 RED GetActiveByUserIdsAsync bulk test | done | RED observed in `RefreshTokenRepositoryBulkTests` |
| 1.4 GREEN IRefreshTokenRepository + RefreshTokenRepository bulk method | done | repo suite green (translatable predicate; `IsActive` computed property cannot translate) |
| 1.5 Verify repo tests GREEN | done | `dotnet test --filter Repositories` green |
| 2.1 RED StoreSessionRevocationServiceTests | done | 4 tests (set-union ∪, distinct, missing store → empty, bulk staging no SaveChanges inside, zero-token no-op) |
| 2.2 GREEN service + interface + DI | done | service tests + full unit green |
| 2.3 RED hook tests in 3 handlers | done | SetStoreActivation (+3), UpdateStore (+3), DeactivateStore (new file, 2) |
| 2.4 GREEN hooks: true→false flip captura + service call | done | unit suite green; A-04 existing E2E still green |
| 2.5 Verify unit suite GREEN | done | 470/470 |
| 3.1 RED RefreshCommand matrix tests | done | 5 additive tests (inactive user/store/owner → 401 + revoke; null store/owner skip; active matrix rotation intact) |
| 3.2 GREEN RefreshCommand activation matrix + RejectAndRevokeAsync | done | R4 carve-out: activation-state failure revokes AND persists |
| 3.3 Verify Refresh filter green | done | refresh tests green |
| 4.1 RED AuthMeBlacklistParityTests (new file) | done | 2 tests: store-inactive second /me → 401; owner-inactive second /me → 401 |
| 4.2 GREEN GetMeQuery BlacklistCurrentTokenAsync before store/owner-inactive returns | done | parity tests + existing AuthMeInactiveStoreOwnerTests green |
| 4.x 1 vs 2 call check on existing suite | done | AuthMeInactiveStoreOwner untouched, green in full E2E |
| 5.1 E2E only-active-store revocation | done | StoreDeactivationSessionTests 1/1 (revoke owner+user, refresh 401, login 403 until reactivation, re-login OK) |
| 5.2 E2E non-last-store isolation | done | 2/2 |
| 5.3 E2E owner second-store unaffected | done | 3/3 |
| 5.4 E2E idempotent same-value (A-13 via SuperAdmin) | done | 4/4 |
| 5.5 Full suite | done | E2E 506/506 (was 500) |
| 6.1 Full backend suite green | done | Application 470, Domain 22, E2E 506 — 998 total |
| 6.2 git status clean; work-unit commits | done | 4 commits; only `.codegraph/` untracked (local infra, excluded) |

## Notes

- SDD attempt: `sha256:5e9717dbc…` settled `passed` with evidence revision
  `sha256:b722d981…`; changed lines 1544 vs explicit 1200 budget exceeded →
  maintainer approved reset (`gentle-ai sdd-attempt reset`, actor Appollo,
  reason: "apply exceeded explicit budget with additive E2E coverage; attempt
  passed; maintainer approved overage").
- E2E suite grew from 500 → 506 with zero existing tests modified.