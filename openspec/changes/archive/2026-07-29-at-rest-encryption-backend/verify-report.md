## Verification Report

**Change**: at-rest-encryption-backend
**Version**: 1.0 — generated at archive time (2026-07-31) against the real code in `backend/src/`, commit `42deff4b`
**Mode**: openspec (file-based) — regenerated because `apply-progress.md` and `verify-report.md` were missing from the archived change

---

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 ✅ |
| Tasks incomplete | 0 |

All 12 tasks from the 4 phases are implemented and accounted for (commit `42deff4b`).

---

### Build & Tests Execution

**Build**: ✅ Passed (0 errors, 8 warnings — pre-existing NuGet vulnerability advisories, unrelated to this change)
> Command: `dotnet build backend\src\SMCA.sln` (note: the solution lives at `backend\src\SMCA.sln`, not `backend\SMCA.sln`)

**Unit Tests (feature scope)**: ✅ 11/11 passed / ❌ 0 failed
```
StoreKeyWrapServiceTests:                2/2 passed  (round-trip unwrap, distinct salt/IV)
StoreDataKeyProviderTests:               5/5 passed  (determinism, per-store, 32B output, empty/whitespace throws)
ExportOfflineRosterQueryHandlerTests:    4/4 passed  (2 auth-fail + 2 success with DEK/wrap verifications)
```

**Full Unit Suites (regression check)**: ✅ PASS
```
Application.Tests:    300/300 passed
Domain.UnitTests:      22/22 passed
```

**E2E Tests**: ✅ 7/7 passed — `ExportOfflineRosterTests` (SuperAdmin full bundle, OwnerAdmin own store, OwnerAdmin foreign store 400, empty store, nonexistent store, plain user 403, DEK stability round-trip) — run against live PostgreSQL.

> Note: the archived `archive-report.md` claims "510/510 tests pass" and the `offline-auth-backend` verify-report claims "237/237 E2E". This verification independently reproduced the affected suites (300 + 22 + 7). The 510/237 figures come from the batch commit message and were not independently re-run in full; no failures were observed in any executed suite.

**Coverage**: ➖ Not configured (no threshold set in config)

---

### Spec Compliance Matrix

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| **R10: DEK Derivation — HKDF (MUST)** | Deterministic per store | `StoreDataKeyProviderTests > GetDek_same_storeId_returns_same_dek` | ✅ COMPLIANT |
| **R10** | Different per store | `StoreDataKeyProviderTests > GetDek_different_storeId_returns_different_deks` | ✅ COMPLIANT |
| **R10** | Known-answer HKDF match | ⚠️ NO dedicated test — replaced by 32-byte output + whitespace-throws tests | ⚠️ PARTIAL (behavior correct — verified by source review of `StoreDataKeyProvider.cs:20`; no independent known-answer assertion) — resolved by T-A1 (`backend-test-and-debt-closure`) |
| **R10** | Empty/whitespace secret throws `ArgumentException` | `StoreDataKeyProviderTests > Constructor_throws_on_empty_secret` + `Constructor_throws_on_whitespace_secret` | ✅ COMPLIANT |
| **R11: DEK Wrapping — PBKDF2 KEK + AES-GCM (MUST)** | Round-trip unwrap (valid Base64, salt 16B, iv 12B, wrapped 48B, decrypt → original DEK) | `StoreKeyWrapServiceTests > WrapDek_round_trip_reproduces_original_dek` | ✅ COMPLIANT |
| **R11** | Distinct salt/IV per call | `StoreKeyWrapServiceTests > WrapDek_distinct_salt_iv_per_call` | ✅ COMPLIANT |
| **R12: Handler DEK Integration (MUST)** | DEK loaded exactly once | Handler test mock verification: `StoreDataKeyProvider.Verify(x => x.GetDek(_storeId), Times.Once)` | ✅ COMPLIANT |
| **R12** | WrapDek called N times — once per user | Handler test mock verification: `Times.Exactly(2)` for 2 users | ✅ COMPLIANT |
| **R13: Bundle FormatVersion Bump (MUST)** | `FormatVersion == 2` | Handler test `.Be(2)` + E2E `.Be(2)`; `ExportOfflineRosterQuery.cs:33` const | ✅ COMPLIANT |
| **R4 (modified)** | `formatVersion == 2`, bundleId valid GUID, expiresAt − issuedAt == 35d, storeId matches | Handler success test + E2E bundle test | ✅ COMPLIANT |
| **R5 (modified)** | Per-user `WrappedDek`/`WrapSalt`/`WrapIv` non-empty | E2E `SuperAdmin_export_roster_returns_full_bundle` asserts non-empty per user; DTO fields verified (`OfflineRosterUserDto.cs:19-21`) | ✅ COMPLIANT |

**Compliance summary**: 10/11 scenarios fully compliant, 1 partial (R10 known-answer — behavior correct, no dedicated test).

---

### Correctness (Static — Structural Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| `IStoreKeyWrapService` + `WrappedDekResult` record | ✅ Implemented | `Application/Abstractions/Authentication/IStoreKeyWrapService.cs` — matches design contract exactly |
| `StoreKeyWrapService` | ✅ Implemented | PBKDF2-SHA256 210K iters, 16B salt, 12B IV, `AesGcm(kek, 16)` tag-size ctor, `Base64(ciphertext ‖ tag)` — matches design crypto table |
| `IStoreDataKeyProvider` + `StoreDataKeyProvider` | ✅ Implemented | `HKDF.DeriveKey(SHA256, secret, 32, salt: null, info: storeId.ToString("D"))`; `ArgumentException.ThrowIfNullOrWhiteSpace` — matches R10 |
| `OfflineRosterUserDto` wrap fields | ✅ Implemented | `WrappedDek`/`WrapSalt`/`WrapIv` added after `Verifier` (lines 19-21), default `""` |
| Handler integration | ✅ Implemented | `FormatVersion = 2` const (L33); `GetDek` once before loop (L79); `WrapDek` per user inside loop (L102); wrap fields attached (L123-125); `_offlineVerifierService` NOT renamed (M2) |
| DI registration | ✅ Implemented | `AddScoped<IStoreKeyWrapService, StoreKeyWrapService>()` + `AddScoped<IStoreDataKeyProvider>(factory)` at `Program.cs:63-65` |
| Config | ✅ Implemented | `StoreEncryption:MasterSecret` in `appsettings.json` (L90-92); available in E2E host via base-config inheritance (fixture `AddJsonFile(appsettings.Tests.json)` is additive, does not override) |
| Handler unit tests | ✅ Implemented | All 4 tests use both new mocks (M6); `.Be(2)` (M7); `_storeId` field (M3); wrap-field assertions; DEK-once + wrap-per-user verifications |
| E2E TestDtos | ✅ Implemented | `RosterUserData` wrap fields (TestDtos.cs:75-77) |
| E2E tests | ✅ Implemented | `.Be(2)` + non-empty wrap asserts + new DEK-stability test |

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| HKDF-derived DEK over stored DEK (D1) | ✅ Yes | No DB changes, no migration — stateless derivation |
| Config via `StoreEncryption:MasterSecret` (D2) | ✅ Yes | Mirrors `Jwt:SecretKey` pattern |
| `AddScoped` registration (D3) | ✅ Yes | Both services scoped; factory delegate for `StoreDataKeyProvider` |
| `WrappedDekResult` record in interface file | ✅ Yes | Mirrors `IOfflineVerifierService` + `OfflineVerifierResult` pattern |
| FormatVersion `1` → `2` (D4) | ✅ Yes | Class-level const + all assertion updates |
| All crypto via `System.Security.Cryptography`, no new NuGet | ✅ Yes | `Rfc2898DeriveBytes`, `AesGcm`, `HKDF`, `RandomNumberGenerator` |
| All 7 critical mismatches (M1-M7) honored | ✅ Yes | Verified per file (see apply-progress.md) |

---

### Issues Found

**CRITICAL** (must fix before archive):
- None.

**WARNING**:
- ⚠️ **D2 — E2E DEK-stability test does not unwrap.** Design/proposal required "export twice → unwrap both → DEKs identical" via a `UnwrapDek` helper. The implemented `SuperAdmin_export_twice_DEK_stability` asserts wrap fields are non-empty and that `WrappedDek` differs between exports (proving fresh salt/IV), but never unwraps the DEKs for byte-for-byte comparison. DEK stability is still proven at unit level (`GetDek_same_storeId_returns_same_dek`), so this is a coverage gap, not a functional defect.
- ⚠️ **D1 — R10 known-answer scenario untested.** `StoreDataKeyProviderTests` has 5 tests but no independent `HKDF.DeriveKey` known-answer assertion (replaced by 32-byte output + whitespace-throws tests). Behavior is correct per source review.

**SUGGESTION** (nice to have):
- The archived `archive-report.md` references engram observation IDs #294-#300 — all 7 EXIST and are retrievable via `mem_get_observation` (verified 2026-07-31): #294 proposal, #295 spec, #296 design, #297 tasks, #298 apply, #299 apply-progress, #300 verify-report. The "15 spec scenarios" and "510/510 tests" figures were not independently re-run in full by this report; the independently verified subset is recorded above.
- No coverage threshold configured — consider enabling for future changes.

---

### Risks
| Risk | Status |
|------|--------|
| PBKDF2 210K iterations slow per user | Acceptable — DEK loaded once, wrapping per user; export is admin-only (documented in proposal) |
| DEK wrap params mismatch with frontend | Documented. Wrap contract pinned: PBKDF2 KEK (210K/SHA256), AES-GCM-128, 12B IV, `Base64(ct ‖ tag)` — frontend MUST match |
| `StoreEncryption:MasterSecret` misconfiguration | Mitigated — `StoreDataKeyProvider` throws `ArgumentException` on empty/whitespace (tested). Production secret should be set outside `appsettings.json` |
| E2E host missing master secret | Mitigated — fixture inherits base `appsettings.json`; 7/7 E2E tests passed proving config resolution |
| Cross-platform crypto byte mismatch | Low — same `System.Security.Cryptography` APIs; round-trip unit test validates |

---

### Verdict

**PASS** (with 2 minor test-coverage deviations)

Implementation is complete and behaviorally correct against the FormatVersion-2 / DEK-wrapping contract. All production code matches the design's crypto parameters byte-for-byte (PBKDF2 210K/SHA256 KEK, AES-GCM-128, HKDF-SHA256 DEK, `Base64(ct ‖ tag)` layout). Build: 0 errors. Executed suites: 300/300 Application.Tests, 22/22 Domain.UnitTests, 7/7 E2E ExportOfflineRosterTests — zero failures. The 12/12 tasks are implemented and committed (`42deff4b`).

Two test-coverage deviations from the design are documented (D1: no known-answer HKDF test; D2: E2E stability test asserts wrapped-blob distinctness rather than unwrapping to compare DEKs). Neither affects production correctness — DEK determinism and the AES-GCM round-trip are each proven elsewhere (unit level). If full spec-scenario compliance is required, add a known-answer HKDF test and a real unwrap-assertion to the E2E stability test; otherwise the change is ready and safe for archive.
