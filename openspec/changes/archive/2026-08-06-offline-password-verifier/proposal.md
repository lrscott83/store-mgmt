# Proposal: offline-password-verifier

## Intent

Offline login and offline data unlock are both broken for every Argon2id user. The backend derives the roster verifier (`OfflineVerifierService.cs:13-27`) and the DEK-wrap KEK (`StoreKeyWrapService.cs:15-42`) from `su.User.Password` (`ExportOfflineRosterQuery.cs:115-116`) — the Argon2id PHC string — while the frontend derives both from `Base64(SHA256(typed password))` (`offline-crypto.ts:85`, `dek-unwrap.ts:48`). They agreed only under the legacy raw-SHA256 format. Two specs already contradict each other on this: `offline-roster-bundle/spec.md:13-18` mandates the pre-hash convention; `offline-auth/spec.md:78` mandates `User.Password`.

## Scope

### In Scope
- `User.OfflinePasswordPreHash` (`string?`, nullable, **encrypted at rest**) + additive EF migration.
- Persist it at all five plaintext choke points; `ExportOfflineRosterQuery.cs:115-116` reads it.
- `OfflineVerifierDto?` + `roster-types.ts` `verifier: OfflineVerifier | null` → graceful `OfflineVerifierError`.
- Cross-stack KAT vector asserted on BOTH sides (`docs/contracts/offline-roster-dek-kat.json` ↔ frontend `dek-kat.json`).
- Correct `openspec/specs/offline-auth/spec.md`; fix the stale `dek-unwrap.ts:1-12` header.
- E2E **seed helpers only** (`ExportOfflineRosterTests.cs:610`, `:627`, `DbTestHelpers`, `AuthzSeed`) persist a pre-hash exactly as a production write site does. Authorized 2026-08-06. Assertions untouched.

### Out of Scope
- Argon2id-in-WASM on the device (rejected: would ship the pepper, `Argon2idHashPasswordService.cs:33`).
- Changing `CreateVerifier`/`WrapDek` algorithms or signatures — only their *argument* changes.
- Backfilling existing users (plaintext is unrecoverable by design).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `offline-auth`: R3 (:68-88), R11 (:196-217), R12 (:219-231), R17 (:286-298) — key material becomes the persisted pre-hash, not `User.Password`; `Verifier` becomes nullable; users with no pre-hash export `Verifier: null` + empty wrap fields.
- `offline-auth-mode`: null-verifier degrades to `OfflineVerifierError`, never "wrong password".

## Approach

**One column serves both defects.** The frontend feeds the *same* pre-hash into the verifier PBKDF2 and the KEK PBKDF2, so a single persisted `Base64(SHA256(UTF8(password)))` (44 chars, `varchar(64)` nullable) is sufficient. No separate material, no salt/iteration columns — the export keeps deriving a fresh salt per bundle.

| Write site | Line | Note |
|---|---|---|
| `CreateOwnerService.cs` | 38 | covers `RegisterCommand.cs:66` + `CreateOwnerCommand.cs:56` |
| `CreateStoreUserCommand.cs` | 60 | |
| `CreateReSellerCommand.cs` | 65 | |
| `UpdateUserPasswordCommand.cs` | 63 | self-change and admin-driven change |
| `AuthenticationService.cs` | 44 | backfill on successful verify, **only when null** |

Users who never log in again keep `null` → no offline access, surfaced explicitly. Persisting via query-then-mutate requires `UpdateAsync` (`CLAUDE.md` NoTracking gotcha; `UpdateUserPasswordCommand.cs:64` is the pattern).

## Security Boundary (the judgement call)

**What an attacker with a DB dump gains: an unsalted, single-iteration SHA-256 of every user's plaintext password.** This is a real regression, and the exploration's "no meaningfully new attack surface" conclusion is wrong. Its argument — that the roster already exposes password-derived material — does not hold: roster values are PBKDF2-210 000-strengthened, so cracking them costs 210 000× a bare SHA-256. Worse, the column is unsalted and un-peppered: identical passwords across users are visibly identical, and precomputed dictionaries apply directly. Today a dump yields memory-hard, peppered Argon2id hashes; after this change it also yields the cheapest possible password oracle.

**Therefore: unacceptable as a bare column. SETTLED (2026-08-06) — the column is encrypted at rest**, reusing the `StoreEncryption:MasterSecret` / `StoreDataKeyProvider` precedent (`Program.cs:64`, `appsettings.json:94-95`). The export decrypts before deriving, so the wire contract and the frontend are unaffected.

**Stated and accepted limit**: this separates *leaked database backup / SQL injection* (defended — the attacker gets ciphertext) from *full host compromise* (undefended — config and DB fall together). Only the former is defended; the user judged that worth it. Design phase pins key derivation, algorithm, and rotation.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `Domain/Entities/Users/User.cs` | Modified | `OfflinePasswordPreHash` property |
| `Infrastructure/Migrations/` | New | `{ts}_Add-OfflinePasswordPreHash.cs` + `.Designer.cs` + snapshot, per `20260804125006_Add-OfflineRosterTtlDays` |
| 5 write sites (table above) | Modified | Derive + persist |
| `ExportOfflineRosterQuery.cs:115-116` | Modified | Read persisted value; `null` → `Verifier: null`, empty wrap |
| `OfflineRosterUserDto.cs:18` | Modified | `OfflineVerifierDto?` |
| `roster-types.ts:24` | Modified | `verifier: OfflineVerifier \| null` |
| `docs/contracts/offline-roster-dek-kat.json` + frontend `dek-kat.json` | Modified | One vector, asserted both sides |
| `openspec/specs/offline-auth/spec.md` | Modified | R3/R11/R12/R17 corrections |
| Unit tests (4 files) | Modified | Not E2E — free to change |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ~~E2E blocker~~ **RESOLVED 2026-08-06**: `SuperAdmin_export_roster_returns_full_bundle` (:34) asserts non-empty `Verifier.Hash`/`WrappedDek` (:64-72) for users seeded via `SeedStoreUserAsync` (:615), which sets no pre-hash. | — | Authorization widened to the seed helpers (`:610`, `:627`, `DbTestHelpers`, `AuthzSeed`). Seeded users now carry a pre-hash like production; the test goes green with its assertions **unchanged**. |
| Full host compromise defeats the at-rest encryption (config + DB fall together) | Med | Accepted, explicitly. Defends leaked-backup / SQLi only. The stronger alternative (persist the 210 000-iteration verifier/KEK instead of the pre-hash) was weighed and not taken — it costs fresh-salt-per-export and two more spec deltas. |
| KAT vector drifts again | Med | Same JSON asserted by `StoreKeyWrapInteropTests` and the frontend KAT test. |
| Rosters on devices invalidated | **None** | Every roster exported since Argon2id is already unusable — this change repairs, it does not break. TTL-bounded (35 d, R15) and re-exported by admins. Pre-Argon2id rosters used exactly `Base64(SHA256(password))`, so they stay valid. |

## Rollback Plan

Revert the commits and drop the column with a down-migration. The column is additive and read-only outside the five write sites; reverting restores today's (broken) behavior with no data loss. Devices lose nothing — nothing worked before.

## Dependencies

- PostgreSQL migration applied before deploy (`WebAppFixture` applies migrations in tests).
- User runs every `dotnet` command; frontend gates via `npx turbo run test --force`.

## Success Criteria

- [x] A cross-stack KAT vector passes on .NET **and** TypeScript.
- [x] E2E proves a roster exported after an online login unwraps with `Base64(SHA256("Password123"))`.
- [x] A user with no pre-hash exports `Verifier: null` and the frontend raises `OfflineVerifierError`, not `OfflineInvalidPasswordError`.
- [x] `offline-auth/spec.md` no longer contradicts `offline-roster-bundle/spec.md:13-18`.
- [x] No existing E2E assertion changed.

---

**Archive-time note (2026-08-06)**: all five success criteria confirmed by `sdd-verify` (Engram `sdd/offline-password-verifier/verify-report` #1950, PASS WITH WARNINGS, 0 CRITICAL) and re-checked at archive time against the merged specs. Checkboxes above updated from the working copy's `[ ]` to `[x]` to reflect completion; no other content changed.
