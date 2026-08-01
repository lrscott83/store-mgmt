# Proposal: Backend Test Gaps and Debt Closure (2026-07-31)

## Intent

Close every debt item from the 2026-07-31 audit (`sdd/explore/debt-audit-2026-07-31`, all verified against real code): add missing backend tests (HKDF known-answer, real DEK unwrap in E2E, rate-limit policy config), fix frontend `paymentStartDate` model/form/command mismatch, correct stale openspec docs (user-repository, offline-auth, at-rest-encryption archive), and close A4 as covered.

## Scope

### In Scope
1. **T-A1** — Known-answer HKDF test in `StoreDataKeyProviderTests` (independent RFC 5869-style vector, byte-for-byte) for `HKDF.DeriveKey(SHA256, secret, 32, salt: null, info: storeId)`
2. **T-A2** — `SuperAdmin_export_twice_DEK_stability`: unwrap both `WrappedDek`s (PBKDF2(passwordHash, wrapSalt, 210_000, SHA256) → AES-GCM) and assert DEKs IDENTICAL
3. **T-A3** — Unit test of `RegisterPolicy` options (PermitLimit=10, Window=10min, per-IP) via testable policy extraction or options assertion
4. **T-B1** — `store.model.ts` `paymentStartDate: Date` → `string | null`; relax `Validators.required` in edit-store form. **Bonus**: add `PaymentStartDate` (DateOnly?) to `UpdateStoreCommand` + validator + handler (frontend PUT field currently silently ignored)
5. **T-C1** — Flip inverted wording in `user-repository/spec.md` (code `!AnyAsync` → true when login UNIQUE/absent); tick checkboxes
6. **T-C2** — Correct `offline-auth/spec.md`: L234 (4→7 E2E scenarios), L242 (no known-answer test; 5 tests), L245 (never unwraps → reference T-A2), L258 (R7/R8 covered → PASS)
7. **T-C3** — Fix archived at-rest-encryption `verify-report.md` false "engram #294-#300 don't exist" claim; R10 known-answer PARTIAL in report + engram #300 (resolved by T-A1)
8. **T-A4** — Close `UpdateStorePaymentStartDateTests`: renamed to `SetStorePaymentDateCommand`; covered by `StoreActivationTests` (3) + `PaymentDateTests` (7). No new test — document mapping + evidence

### Out of Scope
- HTTP 429 E2E rate-limit test (limiter disabled in Testing env) — document as infrastructure gap
- Aggregation-service removal (deferred from `order-offline-service-parity`)

## Approach

Four independent phases:
- **P1 (tests)**: T-A1 independent vector; T-A2 reuses unwrap pattern from `StoreKeyWrapServiceTests.WrapDek_round_trip_reproduces_original_dek` with `RosterUserData` DTO (exposes WrappedDek/WrapSalt/WrapIv); T-A3 extract policy config
- **P2 (frontend)**: type fix + validator relax + additive `UpdateStoreCommand.PaymentStartDate` wiring
- **P3 (docs)**: line-targeted corrections to 2 active specs + archived verify-report
- **P4 (closure)**: A4 rename mapping + E2E coverage evidence in tasks/verify

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `backend/src/Application.Tests/.../StoreDataKeyProviderTests.cs` | Modified | T-A1 |
| `backend/src/SMCA.WebApi.E2ETests/Users/ExportOfflineRosterTests.cs` | Modified | T-A2 |
| `backend/src/SMCA.WebApi/Program.cs` | Modified | T-A3 extract policy |
| `backend/src/Application/.../UpdateStoreCommand.cs` (+Validator) | Modified | T-B1 bonus |
| `frontend/.../stores/store.model.ts`, `edit-store.component.ts` | Modified | T-B1 |
| `openspec/specs/user-repository/spec.md`, `offline-auth/spec.md` | Modified | T-C1/T-C2 |
| `openspec/changes/archive/2026-07-29-at-rest-encryption-backend/verify-report.md` | Modified | T-C3 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Validator change alters edit-store behavior | Med | Relax only `paymentStartDate`; verify create + edit forms |
| UpdateStoreCommand contract change | Low | Additive optional property only |
| T-A2 crypto reimplementation drifts from prod params | Med | Reuse `StoreKeyWrapServiceTests` pattern; pin 210_000/SHA256 |
| HKDF vector computed wrong | Low | Compute independently (external tool) before hardcoding |
| Spec edits over-correct | Low | Touch only cited lines; keep evidence |

## Rollback Plan

All changes are code/test/doc-local, no migrations. Revert per-file via `git checkout`; spec/archive edits are pure markdown.

## Dependencies

- Audit topic `sdd/explore/debt-audit-2026-07-31`; T-A2 on `StoreKeyWrapService` wrap params; T-C2 L245 references T-A2 once implemented.

## Success Criteria

- [ ] T-A1/T-A3: new tests pass; full suite green
- [ ] T-A2: E2E unwraps both DEKs, asserts identity
- [ ] T-B1: frontend builds; null paymentStartDate saves; update command persists date
- [ ] T-C1/T-C2: wording matches code; checkboxes ticked
- [ ] T-C3: archive + engram #300 corrected to PARTIAL
- [ ] T-A4: closure documented with mapping + test evidence
