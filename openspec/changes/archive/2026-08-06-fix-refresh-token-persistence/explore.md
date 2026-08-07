# Exploration: fix-refresh-token-persistence

**Branch**: `fix/refresh-token-persistence` · **Phase**: explore (research only, zero modifications) · **Date**: 2026-08-06

---

## Current State

### The defect chain (empirically proven, not relitigated)

1. **Dead pipeline behaviour** — `backend/src/Application/Behaviours/UnitOfWorkBehaviour.cs:36-40`:
   `IsQuery()` has returned `true` **unconditionally** since initial commit `106de882` (2025-05-15).
   The intended check (`!typeof(TRequest).Name.EndsWith("Command")`) is commented out. Because the
   behaviour is registered as an open MediatR pipeline behavior (`Application/DependencyInjection.cs:33`),
   it wraps **every** request but short-circuits with `await next()` for all of them: no
   `TransactionScope`, no `SaveChangesAsync`. The pipeline is a dead letter.

2. **Login never persists the refresh token** — `LoginCommand.cs:54-58`:
   ```csharp
   string rawRefreshToken = _jwtProvider.GenerateRefreshToken();
   var refreshExpiry = DateTimeOffset.UtcNow.AddDays(_authSettings.RefreshTokenExpirationDays);
   var refreshToken = new RefreshToken(authResult.Data, rawRefreshToken, refreshExpiry);
   _refreshTokenRepository.Add(refreshToken);   // <-- no SaveChangesAsync anywhere in handler
   ```
   The handler injects **no** `IApplicationUnitOfWork`. `Add(...)` only stages the row in the EF
   change tracker; with the pipeline dead and no explicit save, the `RefreshTokens` row never hits
   the database → `/api/v1/auth/refresh` ALWAYS returns 401 `Auth.InvalidRefreshToken`.

3. **Refresh would also never persist (even if login did)** — `RefreshCommand.cs:62-75`:
   the handler reads the old token via `GetByTokenHashAsync` (null/expired/revoked → 401), mints a
   new token, calls `existingToken.Revoke(rawRefreshToken)`, then
   `_refreshTokenRepository.Update(existingToken)` + `_refreshTokenRepository.Add(newRefreshToken)`
   — with the comment `// Persist changes (saved by UnitOfWorkBehaviour pipeline)` (line 73).
   That comment is **false**: the pipeline never saves. Rotation (revoke-old + add-new) would
   silently drop in production even after login persistence is fixed.

4. **Revoke has the same shape** — `RevokeCommand.cs:43-59`: `token.Revoke()` +
   `_refreshTokenRepository.Update(token)` with no explicit save and no UoW injection. Logout /
   revoke would not persist the revocation either.

### The repo-wide pattern: handlers save EXPLICITLY

A scan of every `ICommandHandler` in `backend/src/Application/Features` found **40 handler
files**; **37 of them call `_applicationUnitOfWork.SaveChangesAsync(cancellationToken)` inside the
handler**. The **only 3 that do not** are Login, Refresh, Revoke — all in the refresh-token
cluster. This is why most features work despite the dead pipeline:

- `RegisterCommand.cs:122` — `int changesSaved = await _applicationUnitOfWork.SaveChangesAsync(...)`
- `CreateStoreCommand.cs:63` — `return await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0 ...` (E2E-proven Store row persists)
- `UpdateUserCommand.cs:65` — explicit save after `UpdateAsync` attach (documents the NoTracking trap in a comment)
- `UpdateUserPasswordCommand.cs:69`, `CreateReSellerCommand.cs:80`, etc. — same pattern

**Conclusion: the pipeline bug is real but has zero blast radius today** — every working command
saves itself. The refresh-token cluster is the ONLY place that trusted the (broken) pipeline.

### Persistence plumbing (why the fix is trivial)

- `RefreshTokenRepository.Add/Update` stage changes on the scoped `ApplicationDbContext`
  (`Infrastructure/Persistence/Repositories/RefreshTokenRepository.cs:30-38`; `Update` sets
  `Entry.State = Modified`, correctly handling the repo-wide `QueryTrackingBehavior.NoTracking`).
- `ApplicationUnitOfWork.SaveChangesAsync` flushes the SAME `ApplicationDbContext`
  (`Infrastructure/Persistence/ApplicationUnitOfWork.cs:13-16`), registered scoped
  (`Infrastructure/DependencyInjection.cs:59`).
- ⇒ Injecting `IApplicationUnitOfWork` into Login/Refresh/Revoke handlers and calling
  `SaveChangesAsync` after the repository calls persists the rows. No EF mechanics to solve.

### Settings / DTO surface

- `AuthenticationSettings.RefreshTokenExpirationDays = 7` (default, `appsettings.json:92`).
- `AuthDto` already carries `RefreshToken` and `RefreshTokenExpiresAt` (`AuthDto.cs:3-8`).
- `AuthController` exposes `POST /auth/login`, `POST /auth/refresh` (AllowAnonymous),
  `POST /auth/revoke` (`[Authorize]`).

### E2E state on THIS branch

- `AuthRefreshTokenLifetimeTests.cs` exists **only** on `feat/e2e-auth-inv-01` (commit `7017962e`),
  NOT on this branch. It is a DOCUMENTED RED pinning the 35-day refresh-token lifetime invariant;
  after the 7→35 production change ships it flips green UNTOUCHED. It must NOT be referenced or
  touched here.
- This branch has NO E2E coverage of refresh tokens at all. Existing auth E2E files
  (`AuthLoginSuccessTests`, `AuthTokenLifetimeTests`, etc.) do not touch RefreshTokens rows.
- Local E2E DB: PostgreSQL `localhost:5432`, database `smca_test` (`WebAppFixture` applies migrations).

---

## Affected Areas

| Path | Why |
|------|-----|
| `backend/src/Application/Features/Authentication/Commands/Login/LoginCommand.cs` | **Production defect site.** Add `IApplicationUnitOfWork` + explicit `SaveChangesAsync` after `_refreshTokenRepository.Add(...)` (lines 54-58). |
| `backend/src/Application/Features/Authentication/Commands/Refresh/RefreshCommand.cs` | Same defect: rotation (`Update(old)` + `Add(new)`) never persists; line 73 comment is a false claim. Add UoW + save. |
| `backend/src/Application/Features/Authentication/Commands/Revoke/RevokeCommand.cs` | Same shape: revocation never persists. Add UoW + save (recommended same-change; see Approaches). |
| `backend/src/Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs` | Constructor gains a `Mock<IApplicationUnitOfWork>`; new persistence tests. |
| `backend/src/Application.Tests/Authentication/Commands/Refresh/RefreshCommandHandlerTests.cs` | Constructor gains the mock; extend rotation test to assert `SaveChangesAsync`. |
| `backend/src/Application.Tests/Authentication/Commands/Revoke/RevokeCommandHandlerTests.cs` | Constructor gains the mock; assert save. |
| `backend/src/Application.Tests/Authentication/Commands/Register/RegisterCommandHandlerTests.cs` | **Precedent to copy** — `Handle_ShouldCallSaveChangesAsync_WithCancellationToken` (lines 429-442) is the existing persistence-assertion pattern. |
| `backend/src/Application/Behaviours/UnitOfWorkBehaviour.cs` | **NOT touched by the recommended fix.** Left as known dead code; uncommenting is a separate, risky decision (see Risks). |

---

## Approaches

### Option A — Fix `UnitOfWorkBehaviour.IsQuery()` (uncomment the original check)

Uncomment `//return !typeof(TRequest).Name.EndsWith("Command");` so the pipeline wraps commands in
a `TransactionScope` and calls `SaveChangesAsync` after every command.

- Pros:
  - Restores the original intent of the behaviour.
  - Would "fix" Login/Refresh/Revoke with zero handler changes.
- Cons:
  - **GLOBAL behavioral change with wide blast radius.** The pipeline would call
    `SaveChangesAsync` after EVERY command — including the 37 commands that already save
    explicitly → **double saves on every command** (not catastrophic but wasteful and risky).
  - `TransactionScope` wrapping every command can promote to distributed transactions /
    escalation on some setups (requires `TransactionScopeAsyncFlowOption` handling; not currently
    used). Silent behavior change for all 63 API actions, not just auth.
  - Commands that return early on failure paths may now flush partial mutations the handler
    intentionally did not save.
  - Fixes auth persistence as a side effect but cannot be tested narrowly; requires full-suite
    regression (303 integration + 315 unit + E2E) to trust.
  - Effort: **High** risk, Medium effort.

### Option B — Add explicit `SaveChangesAsync` in the auth handlers (RECOMMENDED)

Inject `IApplicationUnitOfWork` into `LoginCommandHandler`, `RefreshCommandHandler`, and
`RevokeCommandHandler`; call `await _applicationUnitOfWork.SaveChangesAsync(cancellationToken)`
after the repository staging calls. Mirrors the repo-wide precedent exactly.

- Pros:
  - **Matches the established pattern in 37/40 handlers** (RegisterCommand.cs:122 is the direct
    precedent, and its unit test already asserts the save).
  - Narrow blast radius: only the 3 broken auth handlers change; no other feature's behavior moves.
  - The pipeline stays dead — zero risk to the other 63 actions.
  - Small diff: 1 new constructor param + 1 line per handler.
  - Unit-testable precisely under strict TDD (mock UoW, verify `SaveChangesAsync` called once).
- Cons:
  - Leaves `UnitOfWorkBehaviour.IsQuery()` as dead/incorrect code (a latent trap — see Risks).
  - Does not fix the Revoke path unless Revoke is included in this change.
  - Effort: **Low** (3 handlers + 3 test files).

---

## Recommendation

**Option B — explicit `SaveChangesAsync` in the auth handlers, including `RevokeCommand`.**
It is the only fix that is (1) repo-consistent (explicit-save is the de-facto unit-of-work
convention — 37/40 handlers), (2) narrowly blast-radiused (the pipeline bug has zero blast radius
today precisely because everyone else saves themselves), and (3) verifiable under strict TDD with
unit-level precision.

Scope decision: **include Revoke** in this change. It is the same defect family, the same 2-line
pattern, and a logout that silently fails to revoke is a session-hygiene hole. If the user prefers
strictly minimal scope, Revoke can be deferred — but it should be called out, not silently missed.

### Exact files to change (implementation phase)

1. `Login/LoginCommand.cs` — add `IApplicationUnitOfWork _applicationUnitOfWork` (ctor + field);
   after line 58 (`_refreshTokenRepository.Add(refreshToken);`) add
   `await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);`
2. `Refresh/RefreshCommand.cs` — same; replace the false comment on line 73 with the explicit
   save after `_refreshTokenRepository.Add(newRefreshToken);` (line 75)
3. `Revoke/RevokeCommand.cs` — same; save after each `Update(token)` path (lines 44 and 58)
4. Unit tests in the three `Application.Tests/.../Commands/{Login,Refresh,Revoke}/` files:
   update constructors with `Mock<IApplicationUnitOfWork>`, add/strengthen save assertions.

**Do NOT touch**: `UnitOfWorkBehaviour.cs` (out of scope), any E2E test, `AuthRefreshTokenLifetimeTests`
(does not exist on this branch), `openspec/specs/auth-http/spec.md` (register-only contract; no
refresh-token requirements to update).

---

## Strict-TDD Unit Test Plan

Pattern to copy: `RegisterCommandHandlerTests.Handle_ShouldCallSaveChangesAsync_WithCancellationToken`
(RegisterCommandHandlerTests.cs:429-442) — mock UoW, `Verify(x => x.SaveChangesAsync(ct), Times.Once)`.

### RED tests first (write → watch fail → implement)

**Login (`LoginCommandHandlerTests.cs`)** — constructor gains `Mock<IApplicationUnitOfWork>`:
1. `Handle_WithValidCredentials_ShouldCallAdd_AndSaveChangesAsync` — valid credentials → verify
   `_refreshTokenRepository.Verify(x => x.Add(It.Is<RefreshToken>(rt => rt.UserId == userId)), Times.Once)`
   AND `MockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once)`.
2. `Handle_WithInvalidCredentials_ShouldNotSave` — failure path → `SaveChangesAsync` never called.
3. `Handle_WithValidCredentials_ShouldStageRefreshTokenWithExpiryFromSettings` — the added token
   has `ExpiresAt` ≈ now + `RefreshTokenExpirationDays` (7 in the test settings).

**Refresh (`RefreshCommandHandlerTests.cs`)** — constructor gains the mock; existing
`Refresh_rotatesToken_revokesOldToken` already verifies `Update`+`Add` (Times.Once):
4. Extend it (or add) `Refresh_rotatesToken_persistsChanges` — after success,
   `MockUnitOfWork.Verify(x => x.SaveChangesAsync(It.IsAny<CancellationToken>()), Times.Once)`.
5. `Refresh_withInvalidToken_ShouldNotSave` — null/revoked/expired token → save never called.

**Revoke (`RevokeCommandHandlerTests.cs`)** — constructor gains the mock:
6. `Revoke_specificToken_persistsRevocation` — save called once after `Update`.
7. `Revoke_alreadyRevoked_isIdempotent` — **no** `Update` and **no** save.

**Optional hardening** (only if the fix stops here): none required for the pipeline — it stays
untouched. Do NOT add tests that require `UnitOfWorkBehaviour` to save; that would lock in
behavior we are explicitly NOT changing.

### E2E (NEW tests only — existing E2E tests are untouchable)

Not required for this change's proof, and adding them means touching `TestDtos.cs`/helpers —
flag any existing-file touch for explicit user authorization per the E2E rule. If desired later,
the pattern already exists in `AuthRefreshTokenLifetimeTests` on `feat/e2e-auth-inv-01`
(login → query `RefreshTokens` row via `ApplicationDbContext` → assert non-null; refresh → assert
rotation persisted). Do not reference that file here.

---

## Risks

1. **Leaving `UnitOfWorkBehaviour.IsQuery()` broken is a latent trap.** Anyone reading it
   reasonably concludes the pipeline saves and may write a handler that trusts it (exactly how
   this bug was born). Mitigation: the fix comment in RefreshCommand.cs:73 must be corrected, and
   the proposal should note the behaviour is knowingly dead code with a `// Do not rely on this`
   warning added in the same change (documentation only, not behavior).
2. **Option A rejected** — uncommenting the pipeline would double-save 37 commands and add
   `TransactionScope` to every action; unacceptable blast radius for a token-persistence fix.
3. **E2E hygiene** — `AuthRefreshTokenLifetimeTests` exists only on `feat/e2e-auth-inv-01`;
   referencing it here would be wrong. This change must not touch any existing E2E test.
4. **NoTracking semantics** — `Add()` tracks as Added (fine); `Update()` sets Modified (fine).
   No attach pitfalls in this fix, but the tests must exercise the handler, not the DbContext.
5. **Constructor changes ripple** — adding the UoW param breaks every existing Login/Refresh/Revoke
   unit test constructor call; all must be updated in the same change (compile-forced, mechanical).

---

## Ready for Proposal

**Yes.** The defect is fully characterized, the repo pattern is proven (37/40 explicit saves), the
minimal fix is narrow and precedented (Option B, including Revoke), and the strict-TDD unit test
plan is concrete. Tell the user: fix is ~3 handler files + 3 test files, no E2E tests exist on this
branch to worry about, and `UnitOfWorkBehaviour` is left as documented dead code rather than risked
as a global change. Flag the Revoke-inclusion scope question at proposal time.
