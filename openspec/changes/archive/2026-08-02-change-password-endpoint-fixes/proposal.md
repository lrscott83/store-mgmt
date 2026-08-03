# Proposal: Change Password Endpoint Fixes

**Change**: `change-password-endpoint-fixes` — `POST /api/v1/users/change-password` (plan tracker #22)
**Date**: 2026-08-02 | **Mode**: HYBRID | **Review score**: 4.5/10 (api-endpoint-review)

## Intent

Fix the 5 api-endpoint-review findings on the change-password endpoint, align the route contract to the ONE shape both frontends already call (making the endpoint reachable for the first time), close the cross-tenant IDOR on the admin branch, and deliver the plan-frontend doc the contract change requires. The endpoint is broken at 3 levels today: the handler can never verify the old password, any admin can reset any user's password cross-tenant, and the route is unreachable from both frontends (404 at routing).

## Motivation (api-endpoint-review, score 4.5/10)

| # | Finding | Evidence |
|---|---------|----------|
| 1 | Broken BCrypt compare (self-service) | `UpdateUserPasswordCommand.cs:49-53` hashes a random salt via `HashPassword` then compares hashes — can NEVER match `VerifyPassword`. Wrong-password check is dead code |
| 2 | Cross-tenant IDOR | Admin branch `:55-56` resets ANY user's password with zero tenant scope check; `FindAsync` (`GenericRepository.cs:84`) skips the tenant query filter |
| 3 | HTTP 200 always | Business failures return 200+envelope (ErrorHandlerMiddleware only translates thrown exceptions); E2E asserts `StatusCode==OK` — false positive |
| 4 | Weak NewPassword validation | Validator `:28-34` has NO password policy (register enforces 8+uppercase) |
| 5 | Double query | Validator `:40` `GetByIdAsync` + handler fetch = 2 round-trips; param misnamed `tenantId` |
| 6 | Route contract mismatch | Backend `change-password` + body `UserId`; BOTH frontends call `change-password/{id}` (Angular `user.service.ts:65-66`, React `profile-http-service.ts:28-37`) — endpoint unreachable today |

## Decisions (CONFIRMED — do not revisit)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Route | `POST /api/v1/users/change-password/{id}` — route param, `[FromBody]` body, `[ProducesResponseType]` 400/401/403/404 |
| D2 | Wrong old password | **Real HTTP 400** (not 200+envelope, not 401) — user is already authenticated; 400 = request-validation failure; a resolved 200 would make the React consumer log the user out |
| D3 | Nonexistent UserId | 400 via validator `ExistsAsync` (UpdateUser precedent, `Update_nonexistent_id_returns_400`); corrects users-e2e R8 "404" row |
| D4 | Admin branch | KEPT with tenant-scope check: OwnerAdmin → own tenant only (outside → 404, anti-enumeration); SuperAdmin → any tenant. Real 403 only from `[HasPermission]` filter |
| D5 | `UpdateUserCommand.cs:50` tenant hole | OUT OF SCOPE — documented as debt/risk, not fixed here |

## Scope

### In Scope
- **D6 handler** (`UpdateUserPasswordCommand.cs`): null-guard → envelope 404; self path uses `VerifyPassword` (mirror `AuthenticationService.cs:44`); admin branch adds tenant-scope check (`user.TenantId == TenantId claim` for non-SuperAdmin → 404); keep `UpdateAsync`+`SaveChangesAsync`
- **D7 validator**: `GetByIdAsync` → `ExistsAsync`; rename `tenantId` → `userId`; add NewPassword policy `MinimumLength(8)` + uppercase (mirror `RegisterCommandValidator.cs:22-26`); propagate ct
- **D8 controller** (`UsersController.cs:140-146`): route `change-password/{id}`, `[FromBody]`, `command.UserId = id`; ActionCode switch → REAL statuses (mirror `AuthController.cs:30-41`)
- **D9 resources**: add `PasswordMinLength` + `PasswordRequiresUppercase` to BOTH `I18n.resx` + `I18n.en.resx` (string-indexed `_localizer["Key"]`, Designer.cs untouched — fixes latent register fallback too)
- **D10 E2E rewrite** (`UsersChangePasswordTests.cs`): real status asserts; re-login with new password → 200; login with old password → 401; wrong old password → 400; cross-tenant OwnerAdmin → 404; weak password → 400
- **D11 plan doc**: update `docs/plans/endpoints-e2e-coverage.md` #22 (status + detail, mirror rows 20-21)
- **D12 plan-frontend deliverable**: `docs/plans/2026-08-02-change-password-contract-frontend.md` (spec below)
- **D13 delta specs** (apply/archive): users-e2e R8 (404→400 row + pin wrong-old-password=400), command-handler, validation, api-controller

### Out of Scope
- `UpdateUserCommand.cs:50` tenant hole (debt — shared by siblings)
- Frontend code changes (frontends execute their own work per plan-frontend)
- Any other endpoint

## Approach

Mirror the archived `update-user-endpoint-fixes` pattern (handler null-guard → 404, ownership guard → envelope-404, validator `ExistsAsync` swap) plus the evidence-driven deltas: route `{id}` + `[FromBody]` (aligns BOTH frontends — opposite of a breaking change in-repo), real HTTP statuses via ActionCode switch (required by the React consumer which rejects on non-2xx), tenant-scope check on the admin branch (the one hole siblings still carry), and the two missing resx keys.

## Contract (AFTER)

| Aspect | Value |
|--------|-------|
| Request | `POST /api/v1/users/change-password/{id}` — body `{ "oldPassword": "...", "newPassword": "..." }`, `[FromBody]` |
| 200 | Success — password updated (envelope `succeeded:true`) |
| 400 | Wrong old password (D2) / validation (incl. weak NewPassword) / nonexistent id (validator `ExistsAsync`) |
| 401 | Invalid credentials (auth filter, if route reused) |
| 403 | `[HasPermission]` filter only (real 403) |
| 404 | Out-of-tenant admin target (anti-enumeration, envelope 404) / null-race guard |
| Envelope | `ResponseResult<T>` unchanged — real status codes + envelope body for failures |

## Plan-Frontend Deliverable (D12) — content spec for apply

`docs/plans/2026-08-02-change-password-contract-frontend.md` (name pattern `YYYY-MM-DD-<endpoint>-contract-frontend.md`, one per endpoint; replicate `2026-07-30-register-endpoint-fixes-frontend.md` structure):

1. **Contract BEFORE vs AFTER**: route (no `{id}` + body UserId → `{id}` + body password-only), response envelope, real status codes (400/401/403/404)
2. **Affected frontend consumers**: Angular `user.service.ts` changePassword; React `profile-http-service.ts` (note: React admin reset REMOVED — self-service profile only)
3. **Frontend tasks**: handle real 4xx WITHOUT logging out (React `change-password.tsx` currently logs out on any resolved 200 failure); verify URL uses `{id}`; update frontend tests
4. **Verification criteria**

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUserPassword/UpdateUserPasswordCommand.cs` | Modified | D6: VerifyPassword, tenant-scope admin guard, null-guard |
| `.../UpdateUserPasswordCommandValidator.cs` | Modified | D7: ExistsAsync, rename, password policy, ct |
| `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:140-146` | Modified | D8: route, FromBody, ProducesResponseType, ActionCode switch |
| `backend/src/Resources/Localization/I18n.resx` + `I18n.en.resx` | Modified | D9: 2 keys each |
| `backend/src/SMCA.WebApi.E2ETests/Users/UsersChangePasswordTests.cs` | Rewritten | D10: real-status + re-login verification |
| `docs/plans/endpoints-e2e-coverage.md` | Modified | D11: row #22 |
| `docs/plans/2026-08-02-change-password-contract-frontend.md` | New | D12 |
| `openspec/specs/users-e2e/spec.md` R8 | Modified (archive) | 404→400; wrong-old-password pinned 400 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| R8 spec conflict (404 vs 400) | High | Delta spec D13 corrects at archive; UpdateUser precedent already asserts 400 |
| 400-vs-401 product decision contested | Med | Documented as product decision (D2) in proposal + spec |
| Admin branch has no frontend consumer (React removed admin reset) | Med | Tenant-scope check is security fix; behavior change only for cross-tenant abuse path |
| Route change breaks unknown out-of-repo consumers | Low | Verified in-repo: zero consumers of body-contract; both frontends already use `{id}` |
| E2E false-positive legacy | Med | D10 rewrites asserts (re-login proves password actually changed) |
| Dirty tree (prior batches uncommitted) | Med | No git operations this phase; gates = build + E2E only |

## Rollback Plan

Per-file revert, all additive/small: revert controller route/switch to body-contract + 200, restore `HashPassword` compare, drop tenant-scope guard + null-guard, revert validator to `GetByIdAsync` + remove policy, delete 2 resx keys, revert E2E asserts, delete plan-frontend doc. No schema/migration impact.

## Dependencies

- Postgres `smca_test` running — E2E: `dotnet test backend/src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~UsersChangePasswordTests"`
- `VerifyPassword` exists (`AuthenticationService.cs:44`); `IUserRepository.ExistsAsync` exists (GET change); `AuthzSeed.SeedStoreUserAsync((int)FeatureType.Profile)` + `SeedOwnerAdminWithStoreAsync` available
- Plan-frontend format precedent: `docs/plans/2026-07-30-register-endpoint-fixes-frontend.md`

## Success Criteria

- [ ] E2E: re-login with new password → 200; login with OLD password → 401 (proves password actually changed)
- [ ] Wrong old password → HTTP 400 (real); weak NewPassword → 400 with localized key
- [ ] Cross-tenant OwnerAdmin reset → 404; same-tenant OwnerAdmin reset → 200; StoreUser (no Profile) → 403
- [ ] Nonexistent id → 400 (validator, single `ExistsAsync` — no double query)
- [ ] Route `change-password/{id}` + `[FromBody]` + ProducesResponseType 400/401/403/404 documented in Swagger
- [ ] `docs/plans/2026-08-02-change-password-contract-frontend.md` created; plan doc #22 updated
- [ ] Regression: UsersListTests | UsersUpdateTests | UsersChangePasswordTests GREEN
