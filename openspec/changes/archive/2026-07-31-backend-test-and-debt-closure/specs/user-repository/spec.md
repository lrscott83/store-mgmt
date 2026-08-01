# Delta for user-repository: correct inverted wording (T-C1)

**Domain**: `user-repository` — `openspec/specs/user-repository/spec.md` (UR1 + table rows 4a/4b)
**Change**: `backend-test-and-debt-closure`

---

## MODIFIED Requirements

### BT-C1 — IsUniqueLoginAsync Semantics Wording

UR1 in `openspec/specs/user-repository/spec.md` L20 MUST be corrected. Code: `UserRepository.cs` L99-102 returns `!await _users.IgnoreQueryFilters().AnyAsync(u => u.Login == login)` — **true when login is UNIQUE/absent**, **false when it EXISTS**. Current wording ("Returns `true` when login EXISTS (not unique), `false` when absent") and table rows 4a/4b are INVERTED and MUST be flipped. Verification checkboxes MUST be ticked (behavior implemented + tested).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Login unique | `"newUser"` not in DB | `IsUniqueLoginAsync("newUser")` | Returns `true` (unique/absent) |
| 1b | Login duplicated | `"existingUser"` in DB | `IsUniqueLoginAsync("existingUser")` | Returns `false` (not unique) |
| 1c | Async semantics | Any call | Implementation inspected | Uses `AnyAsync()` only — no `Task.FromResult`, `ToList`, sync `.Any()/.All()` |

---

## Verification Criteria

- [ ] UR1 wording flipped to "true = unique/absent, false = exists"; rows 4a/4b match code direction
- [ ] Checkboxes ticked with real test evidence
