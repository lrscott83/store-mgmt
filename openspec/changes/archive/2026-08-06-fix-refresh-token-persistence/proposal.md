# Proposal: Fix Refresh-Token Persistence

## Intent

Refresh tokens are never persisted: `UnitOfWorkBehaviour.IsQuery()` has returned `true` unconditionally since `106de882`, so the MediatR pipeline never saves. Login/Refresh/Revoke are the only 3 of 40 command handlers that trusted it — `RefreshTokens` rows never hit the database, so `/api/v1/auth/refresh` ALWAYS 401s and rotation/revocation silently drop. Fix the auth cluster to save explicitly, matching the repo-wide 37/40 convention.

## Scope

### In Scope
- Inject `IApplicationUnitOfWork` + explicit `SaveChangesAsync` into `LoginCommandHandler`, `RefreshCommandHandler`, `RevokeCommandHandler` (mirror `RegisterCommand.cs:122`)
- Correct the false comment at `RefreshCommand.cs:73`; add "do not rely on this pipeline behaviour" note on `UnitOfWorkBehaviour.IsQuery()` (comment-only, it stays dead)
- NEW unit tests (strict TDD, RED first) in the 3 handler test files; compile-forced constructor updates land in the SAME change (mechanical)
- Revoke included — same defect family; a logout that silently fails to revoke is a session-hygiene hole

### Out of Scope
- Fixing `UnitOfWorkBehaviour.IsQuery()` globally (Option A — rejected, see Approach)
- Any existing E2E test (untouchable per project rule)
- `AuthRefreshTokenLifetimeTests` (exists only on `feat/e2e-auth-inv-01`)
- 7d→35d refresh-token lifetime (AUTH-INV-01, separate future change)

## Capabilities

### New Capabilities
- `refresh-token-persistence`: login MUST persist the issued token; refresh MUST persist rotation (revoke-old + add-new); revoke MUST persist revocation; all three MUST save via `IApplicationUnitOfWork` explicitly; failure paths MUST NOT save.

### Modified Capabilities
- None (`auth-http` is register-only frontend contract; no refresh-token requirements exist to update)

## Approach

**Option B (chosen)** — one ctor param + one `SaveChangesAsync` call per handler after repository staging. Matches 37/40 handler precedent; narrow blast radius; unit-verifiable.

**Option A rejected** — uncommenting `IsQuery()` would double-save the 37 commands that already save explicitly and wrap all 63 API actions in `TransactionScope` (escalation risk, partial flush on early-return paths). Unacceptable blast radius for a token-persistence fix; requires full-suite regression to trust.

**Strict TDD** — RED tests first, watch fail, then implement. Precedent: `RegisterCommandHandlerTests.Handle_ShouldCallSaveChangesAsync_WithCancellationToken` (`RegisterCommandHandlerTests.cs:429-442`).
- Login: valid creds → `Add` + `SaveChangesAsync` once; invalid creds → no save; staged token expiry = now + settings days
- Refresh: success → save once; null/revoked/expired → no save
- Revoke: specific token → save once after `Update`; already-revoked → idempotent (no `Update`, no save)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Application/Features/Authentication/Commands/Login/LoginCommand.cs` | Modified | +UoW ctor, save after `Add` (54-58) |
| `Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` | Modified | +UoW, save after `Add(new)`; fix false comment :73 |
| `Application/Features/Authentication/Commands/Revoke/RevokeCommand.cs` | Modified | +UoW, save after each `Update` path |
| `Application/Behaviours/UnitOfWorkBehaviour.cs` | Modified | comment-only: dead code warning |
| `Application.Tests/.../Commands/{Login,Refresh,Revoke}/*HandlerTests.cs` | Modified | ctor mocks + new persistence tests (compile-forced) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Handler trusts dead pipeline again (latent trap) | Med | Corrected comment + warning note in same change |
| Constructor ripple breaks existing tests | High | Compile-forced; mechanical; updated same change |
| NoTracking attach trap | Low | `Add`/`Update` semantics already correct; tests exercise the handler |

## Rollback Plan

`git revert` the 3 handler diffs + test updates. No schema or migration involved; behavior returns to today's baseline (refresh 401s). Zero risk to other features — only the auth cluster changes.

## Dependencies

- None external. `dotnet test backend/src/SMCA.sln` for unit/regression; local PostgreSQL `smca_test` only if E2E is run.

## Success Criteria

- [ ] New RED tests fail before implementation, pass after (strict TDD)
- [ ] `dotnet test backend/src/SMCA.sln` green (Application.Tests included)
- [ ] `POST /auth/refresh` succeeds after login (manual verification; no existing E2E touched)
- [ ] Zero existing E2E tests modified
