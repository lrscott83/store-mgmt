# Delta for repository: IUserRepository — ExistsAsync Signature Alignment

**Domain**: `repository` — `IUserRepository.cs` + `UserRepository.cs`
**Change**: `update-user-endpoint-fixes`
**Status**: Draft
**Last Updated**: 2026-07-31

---

## MODIFIED Requirements

### Requirement: RR-U1 — ExistsAsync Documented Signature Gains CancellationToken

RR-G1 documented `Task<bool> ExistsAsync(Guid id)`; the implemented signature (`IUserRepository.cs:19`) is `Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken = default)`, with the implementation forwarding the token (`UserRepository.cs:99-102`). This delta aligns the spec to the code: NO new method is needed — the UpdateUser validator (validation delta VL-U1) consumes this existing signature, passing `userId` + `cancellationToken`.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Signature matches code | Spec compared with `IUserRepository.cs:19` | Signature inspected | `ExistsAsync(Guid id, CancellationToken cancellationToken = default)` documented |
| 1b | No new method | UpdateUser change implemented | Repository interface inspected | Zero new repository methods — existing `ExistsAsync` reused |
| 1c | Validator consumes | UpdateUserValidator runs | `ExistsAsync(userId, ct)` | Single `AnyAsync` query with token forwarded |

## Verification Criteria

- [ ] Main repository spec documents the `CancellationToken` parameter on `ExistsAsync` (merged at archive)
- [ ] No new repository method introduced by this change
