# Delta for offline-auth: stale verification claims (T-C2)

**Domain**: `offline-auth` — `openspec/specs/offline-auth/spec.md` Verification Criteria block
**Change**: `backend-test-and-debt-closure`

---

## MODIFIED Requirements

### BT-C2 — Verification Criteria Corrected to Match Real Code

The Verification Criteria block MUST be corrected at the cited lines:

| # | Line | Current (stale) | Corrected (verified) |
|---|------|-----------------|----------------------|
| 1a | L234 | "All 4 E2E scenarios pass (SuperAdmin success, OwnerAdmin own store, OwnerAdmin other store, plain user denied)" | All 7 E2E scenarios pass — `ExportOfflineRosterTests` also has empty store, nonexistent store, and DEK stability tests |
| 1b | L242 | "StoreDataKeyProvider unit tests pass (determinism, per-store uniqueness, known-answer, missing secret) — 4/4 passing" | 5/5 passing — determinism, per-store, 32-byte output, empty/whitespace secret throws. NO known-answer test — gap tracked by T-A1 |
| 1c | L245 | "E2E: export twice → unwrap both → DEKs are identical — round-trip stability verified" | E2E asserts wrap fields non-empty and `WrappedDek` differs (fresh salt/IV) but does NOT unwrap — unwrap assertion added by T-A2 |
| 1d | L258 | "Verification: Base — PASS WITH WARNINGS (R7/R8 lack dedicated test coverage)" | PASS — R7 covered by `SuperAdmin_empty_store_returns_empty_users`, R8 by `SuperAdmin_nonexistent_store_returns_empty_users` |

---

## Verification Criteria

- [ ] L234 count corrected 4 → 7 with full scenario list
- [ ] L242 states 5/5 passing, no known-answer test (T-A1 gap)
- [ ] L245 states actual behavior (no unwrap; T-A2 pending)
- [ ] L258 reads PASS (R7/R8 covered)
