# Exploration: change-password-endpoint-fixes

**Change**: `change-password-endpoint-fixes` — `POST /api/v1/users/change-password` (plan tracker #22, `docs/plans/endpoints-e2e-coverage.md:58`)
**Mode**: HYBRID (openspec + engram) | **Date**: 2026-08-02 | **Score**: 4.5/10 (api-endpoint-review)

## Current State

`POST /api/v1/users/change-password` is broken at 3 levels: (1) the handler can NEVER verify the old
password (BCrypt random-salt comparison via `HashPassword`), (2) any OwnerAdmin/SuperAdmin can reset ANY
user's password cross-tenant with zero scope check (IDOR via body `UserId` + filter-skipping `FindAsync`),
(3) the route contract does not match EITHER frontend consumer (both call `change-password/{id}` with the id
in the URL; the backend has `change-password` with `UserId` in the body — the endpoint is unreachable from
both frontends today, 404 at routing). Business errors come back as HTTP 200 + envelope (ErrorHandlerMiddleware
only translates thrown exceptions), and the E2E test only asserts StatusCode==OK — a false positive.

## Affected Areas

- `backend/src/Application/Features/UserManagement/Users/Commands/UpdateUserPassword/UpdateUserPasswordCommand.cs` — broken BCrypt compare (:49-53), IDOR admin branch (:55-56), no null guard (:48)
- `.../UpdateUserPasswordCommandValidator.cs` — double query `GetByIdAsync` (:40), param misnamed `tenantId` (:38), NO password policy (:28-34)
- `backend/src/SMCA.WebApi/Controllers/v1/UsersController.cs:140-146` — route lacks `{id}`, no `[FromBody]`, missing ProducesResponseType 400/401/403/404
- `backend/src/SMCA.WebApi.E2ETests/Users/UsersChangePasswordTests.cs` — status-code-only false positive; no re-login verification
- `backend/src/Resources/Localization/I18n.resx` + `I18n.en.resx` — missing `PasswordMinLength`/`PasswordRequiresUppercase` keys (register falls back to literal key names)
- `openspec/specs/users-e2e/spec.md:113-123` (R8) — "Non-existent UserId → 404" contradicts validator (→400); "wrong OldPassword → 400 or 403" ambiguous
- `docs/plans/endpoints-e2e-coverage.md:58` — row #22 pending; detail section :306-313
- Frontends: `frontend/src/app/_services/user/user.service.ts:65-66`, `frontend/src/app/presentation/users/edit-user-credentials/edit-user-credentials.component.ts:48,60-68`, `frontend-react/apps/web-store-pos/app/profile/lib/services/profile-http-service.ts:28-37`, `frontend-react/apps/web-store-pos/app/profile/routes/change-password.tsx:24-31`

## Approaches

1. **Contract-first route + self-service-only semantics (recommended)** — Route → `[HttpPost("change-password/{id}")]`, id from route (`command.UserId = id`), mirroring `UpdatedAsync` (:66-69). Handler: null guard → 404; ownership guard (self-or-admin) → envelope 404 (anti-enumeration, mirrors `UpdateUserCommand.cs:46-51` + CH-U1); **self path uses `VerifyPassword`** (mirrors `AuthenticationService.cs:44`); admin path adds **tenant scope check** (`user.TenantId == TenantId claim` for non-SuperAdmin → 404). Controller maps failure ActionCodes → real HTTP statuses (mirror `AuthController.cs:35-41` switch). Validator: `GetByIdAsync` → `ExistsAsync` + rename param (VL-U1), add NewPassword policy (8+uppercase, mirror Register) + add the 2 resx keys. E2E: assert real statuses + re-login with new password. Pros: fixes the contract mismatch (frontends already call `change-password/{id}`), closes IDOR, real statuses satisfy React's rejection-based error UX, self-service matches what both frontends actually ship (React removed admin changePassword). Cons: breaking change vs the CURRENT backend contract (body UserId) — but zero in-repo consumers use that contract. Effort: Medium.
2. **Keep body contract, patch handler only** — Keep `POST change-password` + body UserId, just fix VerifyPassword + guards. Pros: no route change. Cons: endpoint stays unreachable from both frontends (contract mismatch persists), admin reset remains exposed (IDOR), E2E can't pass end-to-end through the real frontend contract. Effort: Low but incomplete.
3. **Envelope-only (HTTP 200 + ActionCode), no controller switch** — mirror UpdateUser exactly, no real HTTP statuses. Pros: sibling-consistent. Cons: React `change-password.tsx` treats any resolved 200 as success → **logs the user out on wrong old password** (data-corrupting UX); the review finding #3 stays unfixed. Rejected for the failure paths.

## Recommendation

Approach 1. Mirror the ARCHIVED sibling `update-user-endpoint-fixes` for handler shape (null-guard, ownership
guard, `ExistsAsync` validator) but go one step further on two axes where the evidence is unambiguous:
(a) route `{id}` + `[FromBody]` (matches BOTH frontends — this is the opposite of a breaking change), and
(b) real HTTP statuses for failure paths via an ActionCode switch like `AuthController.AuthAsync` — required by
the React consumer which rejects on non-2xx and logs out on ANY resolved response. Also add the tenant-scope
check on the admin branch (User.TenantId vs TenantId claim) — the one hole the siblings still carry
(`UpdateUserCommand.cs:50` has the same cross-tenant IDOR). Add the two missing resx keys (also fixes the
latent register message bug).

## Risks

- **Route change breaks any out-of-repo consumer** of the CURRENT body-contract (none found in-repo; both frontends already use the `{id}` route — verified by grep).
- **R8 spec rows conflict**: "Non-existent UserId → 404" (spec) vs validator `ExistsAsync` → 400 (behavior). Decide the contract in proposal/spec; UpdateUser precedent asserts 400 (`UsersUpdateTests.cs:79-90`).
- **Wrong-old-password status**: 400 (current handler) vs 401 (Login convention `LoginCommand.cs:89-90`). Recommend 400 for the self-service validation error; either works for the React consumer (any 4xx rejects).
- **Tenant-scope check on admin branch** is NEW behavior vs siblings — OwnerAdmin can currently reset cross-tenant passwords (confirmed IDOR via `FindAsync` filter-skip, `GenericRepository.cs:84`); closing it is a security fix but is a behavior change for the admin path (which has no frontend consumer — React removed admin changePassword).
- **E2E false-positive**: current `Change_own_password_returns_200` passes while broken; MUST be rewritten to assert the password actually changed (re-login with new password / login with old → 401).

## Ready for Proposal

Yes. Deliverable set for sdd-propose:
- D1 route `{id}` + `[FromBody]` + ProducesResponseType 400/401/403/404 (controller)
- D2 handler: null-guard → 404; VerifyPassword for self old-password; ownership+tenant guard for admin path; keep UpdateAsync+SaveChangesAsync
- D3 validator: `GetByIdAsync` → `ExistsAsync` (rename `tenantId`→`userId`), NewPassword policy 8+uppercase, propagate ct
- D4 resources: add `PasswordMinLength` + `PasswordRequiresUppercase` to BOTH resx (fixes register fallback too)
- D5 controller: ActionCode switch → real HTTP statuses (mirror AuthController.AuthAsync)
- D6 E2E rewrite: real-status asserts + re-login verification + cross-tenant OwnerAdmin → 404 + weak-password → 400
- D7 plan doc row #22 + detail section update (mirror rows 20-21 format)
- D8 delta specs: users-e2e R8 (fix 404→400 row + pin wrong-old-password status), command-handler, validation, api-controller
