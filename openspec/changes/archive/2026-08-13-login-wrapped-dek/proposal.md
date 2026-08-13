# Proposal: Login Delivers Wrapped DEK to Every Authenticated User

**Change**: `login-wrapped-dek` — propose — 2026-08-13 — hybrid (file + engram `sdd/login-wrapped-dek/proposal`)

## Summary

Backend-only: login response (`AuthDto`) gains `wrappedDek`/`wrapSalt`/`wrapIv` — the store DEK wrapped with the user's password pre-hash — for ANY authenticated user, no admin permission; roster-compatible, export untouched. Production edits (`AuthDto` + `LoginCommandHandler`) pre-approved.

## Problem

The DEK leaves the backend only via the admin-only roster export; online login never receives it, so the frontend mints a key the server can never recover. Encryption must be independent of authentication mode.

## Scope

### In Scope
- `AuthDto` + `WrappedDek`/`WrapSalt`/`WrapIv` (wire `wrappedDek`/`wrapSalt`/`wrapIv`), same format as `OfflineRosterUserDto`, optional, default `""`.
- `LoginCommandHandler`: after pre-hash backfill (`IsValidUserAsync`), re-query user, `Unprotect` → `GetDek(SelectedStoreId)` → `WrapDek` → map; try/catch → empty fields.
- New E2E `AuthLoginDekWrapTests.cs` (own unwrap helper): StoreUser/OwnerAdmin happy paths (byte-equality vs `GetDek`), first-login backfill, SuperAdmin → empty, 401/403 no key. Internal degradation (null preHash, wrap throw, Guid.Empty) → unit tests.

### Out of Scope
- Roster export/format; frontend consumption (separate change); new services; DB changes; Register/Refresh behavior.

## Capabilities

### New Capabilities
- `auth-login-wrapped-dek`: login response delivers the wrapped store DEK to any authenticated user; roster-compatible; empty-on-failure.

### Modified Capabilities
- `auth-login-e2e`: E2E coverage requirements for login-delivered wrapped DEK (new files only).

## Approach

Inline helper: `Unprotect` stored preHash (never `User.Password` PHC) → `GetDek(SelectedStoreId)` → `WrapDek`; re-query via `GetUserByIdIgnoreQueryFiltersAsync` after backfill (NoTracking + ExecuteUpdateAsync stale the loaded entity). Decisions: all authenticated users; no `SelectedStoreId` (SuperAdmin) → empty until re-login; corrupt/absent envelope → empty; only login delivers.

## Affected Areas

- `Application/Dtos/Authentication/AuthDto.cs` — Modified (+3 optional params)
- `Application/Features/Authentication/Commands/Login/LoginCommand.cs` — Modified (re-query + wrap)
- `Application.Tests/Authentication/Commands/Login/LoginCommandHandlerTests.cs` — Modified (ctor: +4 mocks)
- `SMCA.WebApi.E2ETests/Auth/AuthLoginDekWrapTests.cs` — New

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Wrap degrade (corrupt envelope, throw) | Med | Empty fields; login never fails; unit-tested |
| Byte drift vs roster | Low | Same services + preHash; E2E byte-equality |
| 400-line budget | Low | ~60–80 prod/unit + ~200 E2E; chain if over |

## Rollback Plan

Remove the 3 optional `AuthDto` params (additive) and the handler wrap block; delete the new E2E file. Roster untouched — no roster rollback.

## Dependencies

None — services already registered (roster path).

## Success Criteria

- [ ] Plain user logs in online and receives the three fields; unwrapped key equals that user's roster-export key (same `GetDek(storeId)`, same Unprotect preHash).
- [ ] First login (same-request backfill) → non-empty; Register/Refresh → empty.
- [ ] SuperAdmin → empty; invalid creds → 401; inactive store → 403 (no key).
- [ ] New unit/E2E tests pass; existing suites green; roster E2E untouched.

## Open Questions

None.
