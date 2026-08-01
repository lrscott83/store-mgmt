## Verification Report

**Change**: offline-auth-backend
**Version**: 2.0 — regenerated at archive time against the evolved FormatVersion-2 / DEK-wrapping contract (2026-07-31)
**Original verdict**: PASS WITH WARNINGS (FormatVersion 1, 2026-07-29) — superseded, see "Warning Resolution" below.

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 15 |
| Tasks complete | 15 ✅ |
| Tasks incomplete | 0 |

All 15 tasks from the 6 phases are implemented and accounted for (commit `4eb56c07`, plus evolution in `42deff4b`).

---

### Build & Tests Execution

**Build**: ✅ Passed (0 errors)

**Unit Tests (offline-auth feature scope)**: ✅ 15 passed / ❌ 0 failed / ⚠️ 0 skipped
```
Base (commit 4eb56c07):
  OfflineVerifierServiceTests:                2/2 passed
  AllowedFeaturesServiceTests:                3/3 passed
  ExportOfflineRosterQueryHandlerTests:       4/4 passed
Evolution (commit 42deff4b):
  StoreKeyWrapServiceTests:                   2/2 passed  (round-trip unwrap, distinct salt/IV)
  StoreDataKeyProviderTests:                  4/4 passed  (determinism, per-store, known-answer, missing secret)
```

**Full Test Suite (post-evolution)**: ✅ 510/510 passed / ❌ 0 failed — ZERO regressions (per `at-rest-encryption-backend` archive report, committed in `42deff4b`).

**E2E Tests**: ✅ **237/237 passing** (per commit `42deff4b` message). `ExportOfflineRosterTests` contributes 7 scenarios — the original 4 (SuperAdmin success, OwnerAdmin own store, OwnerAdmin foreign store, plain user denied) plus 3 added by the evolution commit (empty store, nonexistent store, DEK stability).

**Coverage**: ➖ Not configured (no threshold set in config)

---

### Spec Compliance Matrix (evolved contract — FormatVersion 2 + DEK wrapping)

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| **R1: Endpoint Contract** | Valid storeId, authorized caller → 200 with OfflineRosterDto | `ExportOfflineRosterQueryHandlerTests > Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers` | ✅ COMPLIANT |
| **R2: Authorization Scope** | SuperAdmin any store → 200 | Handler success test + `ExportOfflineRosterTests > SuperAdmin_export_roster_returns_full_bundle` | ✅ COMPLIANT |
| **R2: Authorization Scope** | OwnerAdmin own store → 200 | `ExportOfflineRosterTests > OwnerAdmin_own_store_returns_200` | ✅ COMPLIANT |
| **R2: Authorization Scope** | OwnerAdmin foreign store → 400 ApiException | `ExportOfflineRosterQueryHandlerTests > Handle_ShouldThrowApiException_WhenOwnerAdminRequestsForeignStore` | ✅ COMPLIANT |
| **R2: Authorization Scope** | Plain user → 403 Forbidden | `ExportOfflineRosterTests > Plain_store_user_returns_403` | ✅ COMPLIANT |
| **R3: Verifier Algorithm** | Deterministic with known salt matches Pbkdf2 reference | `OfflineVerifierServiceTests > CreateVerifier_produces_16byte_salt_and_reproducible_pbkdf2` | ✅ COMPLIANT |
| **R3: Verifier Algorithm** | Fresh salt per call produces different salt/hash | `OfflineVerifierServiceTests > CreateVerifier_uses_a_fresh_salt_each_call` | ✅ COMPLIANT |
| **R4: Bundle Metadata** | formatVersion==2, bundleId valid GUID, expiresAt-issuedAt==35d ms | Handler success test + E2E bundle tests (updated to `.Be(2)`) | ✅ COMPLIANT |
| **R5: Per-User Data Shape** | Shape matches /me output incl. WrappedDek/WrapSalt/WrapIv | Structural (DTO fields verified in source) + E2E asserts `user.WrappedDek` non-empty | ✅ COMPLIANT |
| **R6: Inactive Users Included** | Mix active+inactive → both appear | `Handle_SuperAdmin_ReturnsFullRosterWithTwoUsers` (1 active + 1 inactive user) | ✅ COMPLIANT |
| **R7: Empty Store** | Zero users → Users: [] | **`ExportOfflineRosterTests > SuperAdmin_empty_store_returns_empty_users`** (new in `42deff4b`) | ✅ COMPLIANT |
| **R8: Invalid StoreId** | Non-existent store → empty roster (SuperAdmin) | **`ExportOfflineRosterTests > SuperAdmin_nonexistent_store_returns_empty_users`** (new in `42deff4b`) | ✅ COMPLIANT |
| **R9: VerifierService Stateless & Thread-Safe** | Concurrent calls produce independent salts (no shared Random) | `RandomNumberGenerator.GetBytes()` thread-safe; verified by fresh-salt test | ✅ COMPLIANT |
| **R10: DEK Derivation — HKDF** | Deterministic per store, distinct per store, known-answer | `StoreDataKeyProviderTests` (4/4) | ✅ COMPLIANT |
| **R11: DEK Wrapping — PBKDF2 KEK + AES-GCM** | Round-trip unwrap, distinct salt/IV per call | `StoreKeyWrapServiceTests` (2/2) | ✅ COMPLIANT |
| **R12: Handler DEK Integration** | DEK loaded once; WrapDek called N times per user | Handler tests — `GetDek` called exactly once, `WrapDek` once per user (mock verify) | ✅ COMPLIANT |
| **R13: FormatVersion Bump** | Bundle returns FormatVersion == 2 | Handler + E2E assertions `.Be(2)` | ✅ COMPLIANT |

**Compliance summary**: **17/17 scenarios fully compliant** (was 11/13 with 2 partials under FormatVersion 1).

---

### Correctness (Static — Structural Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R1: Endpoint Contract | ✅ Implemented | Route GET /api/v1/storeusers/{storeId}/offline-roster returns ResponseResult&lt;OfflineRosterDto&gt; |
| R2: Authorization Scope | ✅ Implemented | Two-layer: [HasPermission] class-level + handler-level role/ownership check |
| R3: Verifier Algorithm | ✅ Implemented | PBKDF2-HMAC-SHA256, 210K iters, 16B salt, 32B key, UTF-8 of stored password hash |
| R4: Bundle Metadata | ✅ Implemented | bundleId=new GUID, issuedAt=Unix ms, expiresAt=issuedAt+35d, **formatVersion=2** (`ExportOfflineRosterQuery.cs:33`) |
| R5: Per-User Data Shape | ✅ Implemented | All fields present incl. `WrappedDek`/`WrapSalt`/`WrapIv` (`OfflineRosterUserDto.cs:19-21`) |
| R6: Inactive Users Included | ✅ Implemented | includeInactive: true in repo call |
| R7: Empty Store | ✅ Implemented + tested | E2E `SuperAdmin_empty_store_returns_empty_users` |
| R8: Invalid StoreId | ✅ Implemented + tested | E2E `SuperAdmin_nonexistent_store_returns_empty_users` |
| R9: Thread-Safe Verifier | ✅ Implemented | RandomNumberGenerator.GetBytes() is thread-safe; no instance state beyond consts |
| R10: DEK Derivation | ✅ Implemented | `IStoreDataKeyProvider.GetDek` — HKDF-SHA256 from `StoreEncryption:MasterSecret`; empty secret throws `ArgumentException` |
| R11: DEK Wrapping | ✅ Implemented | `IStoreKeyWrapService.WrapDek` — PBKDF2 KEK (210K, SHA256) + AES-GCM-128; `WrappedDek=Base64(ct ‖ tag)` |
| R12: Handler DEK Integration | ✅ Implemented | `GetDek` once (line 79), `WrapDek` per user (line 102) |
| R13: FormatVersion Bump | ✅ Implemented | `FormatVersion = 2` constant + set on bundle (line 135) |
| Repo: GetStoreUsersByStoreIdAsync | ✅ Implemented | Filters by StoreId, Include Store+User, IgnoreQueryFilters, OrderBy FullName |
| AllowedFeaturesService overload | ✅ Implemented | New GetAllowedFeatureIdsForUserAsync(Guid, List&lt;int&gt;) on interface + implementation |
| DI Registration | ✅ Implemented | `AddScoped<IOfflineVerifierService, OfflineVerifierService>()` + both DEK services in Program.cs |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Auth: class-level [HasPermission] + handler narrowing | ✅ Yes | Both layers present, matching GetStoreUsersQueryHandler pattern |
| Per-user features via separate overload | ✅ Yes | GetAllowedFeatureIdsForUserAsync on IAllowedFeaturesService with IUserRoleRepository injection |
| OfflineVerifierResult as record in interface file | ✅ Yes | Inline sealed record in IOfflineVerifierService.cs |
| DEK derived (HKDF) over stored column | ✅ Yes | No migration; `StoreEncryption:MasterSecret` follows `Jwt:SecretKey` pattern |
| DEK loaded once per export, wrapped per user | ✅ Yes | Verified via mocks in handler tests |
| WrappedDekResult record in interface file | ✅ Yes | Mirrors OfflineVerifierResult pattern |
| FormatVersion bump to 2 | ✅ Yes | Const + assertion updates (`.Be(2)`) across unit + E2E |
| Controller action matching GetStoreUsers pattern | ✅ Yes | |
| throw ApiException for unauthorized (not Failure) | ✅ Yes | Matches GetStoreUsersQueryHandler pattern |
| Uses _http.UserExternalId.ToGuid() (not UserId) | ✅ Yes | Per IHttpContextService interface |

---

### Issues Found

**CRITICAL** (must fix before archive):
- None

**WARNING**:
- ~~⚠️ R7 (Empty Store) and R8 (Invalid StoreId) lack test coverage~~ → **RESOLVED** by `SuperAdmin_empty_store_returns_empty_users` and `SuperAdmin_nonexistent_store_returns_empty_users` (commit `42deff4b`).
- ~~⚠️ E2E test DTO (RosterUserData) missing fields (Roles, IsSuperAdmin, IsOwnerAdmin, IsReSeller, SelectedStoreId)~~ → **RESOLVED** — `RosterUserData` now mirrors the full `OfflineRosterUserDto` shape including `WrappedDek`/`WrapSalt`/`WrapIv` (verified in `Infrastructure/TestDtos.cs:61-78`).

**SUGGESTION** (nice to have):
- No coverage threshold configured — consider enabling for future changes.

---

### Risks
| Risk | Status |
|------|--------|
| PBKDF2 params mismatch with frontend | Documented. Params verified against spec. Frontend MUST match: 210K iters, SHA256, 16B salt, 32B key, input = UTF-8 of Base64 stored hash |
| DEK wrap params mismatch with frontend | Documented. Wrap contract pinned: PBKDF2 KEK (210K/SHA256), AES-GCM-128, 12B IV, `Base64(ct ‖ tag)` — see at-rest-encryption-backend spec |
| `StoreEncryption:MasterSecret` misconfiguration | `StoreDataKeyProvider` throws `ArgumentException` on empty/whitespace secret (tested). Production secret must be set outside `appsettings.json` |
| N+1 handler loop | Acceptable for <100 users per store (as spec'ed). Each user triggers 1 role-feature DB call |
| AllowedFeaturesService ctor change regressions | ✅ None — 510/510 tests pass post-evolution |

---

### Verdict
**PASS**

Implementation is complete and behaviorally correct against the **evolved FormatVersion-2 / DEK-wrapping contract**. All 17 spec scenarios are compliant with passing tests. Both warnings from the original verification (R7/R8 coverage gaps, E2E DTO missing fields) are resolved by the 3 new E2E tests added in commit `42deff4b`. Build: 0 errors. E2E suite: 237/237 passing. Full suite: 510/510 passing. Ready for archive.
