# Archive Report: offline-auth-backend

**Archived**: 2026-07-31
**Change**: offline-auth-backend
**Mode**: hybrid (engram + openspec)

## Executive Summary

`offline-auth-backend` delivered the offline roster export endpoint `GET /api/v1/storeusers/{storeId}/offline-roster` — a store-scoped roster of users with per-user PBKDF2 offline verifiers and anti-replay bundle metadata, enabling devices to authenticate users offline without the API.

The feature went through **two contract versions**:

1. **FormatVersion 1** (commit `4eb56c07`, 2026-07-29): base implementation — 15/15 tasks, PBKDF2-HMAC-SHA256 verifiers (210K iters, 16B salt, 32B key), bundle metadata (bundleId/issuedAt/expiresAt/formatVersion=1), two-layer auth (SuperAdmin any store, OwnerAdmin owned stores only), 9 unit tests + 4 E2E scenarios. Verified **PASS WITH WARNINGS** (R7/R8 lacked dedicated test coverage; E2E DTO missing fields).
2. **FormatVersion 2** (commit `42deff4b`, 2026-07-30): **post-verification evolution** — FormatVersion 1→2, per-user **DEK wrapping** (`WrappedDek`/`WrapSalt`/`WrapIv` via new `IStoreKeyWrapService` + `IStoreDataKeyProvider`: HKDF-derived per-store DEK from `StoreEncryption:MasterSecret`, PBKDF2 KEK + AES-GCM-128 wrap), handler loads DEK once per export and wraps per user, +3 E2E tests (empty store, nonexistent store, DEK stability) closing **both** verify warnings. E2E suite **237/237 passing**; full suite **510/510 passing**.

Final verification: **PASS** — all 17 spec scenarios compliant against the evolved contract.

## Artifact Lineage (Engram Observation IDs)

| Artifact | Engram ID | Topic Key |
|----------|-----------|-----------|
| Explore | #282 | sdd/offline-auth-backend/explore |
| Status investigation (pre-archive audit) | #476 | sdd/2026-07-29-offline-auth-backend/status |
| Proposal / Spec (delta) / Design / Tasks / Verify | — | Authored directly into `openspec/changes/archive/2026-07-29-offline-auth-backend/` (no separate engram observations — see note below) |
| Archive Report | — | sdd/2026-07-29-offline-auth-backend/archive-report |

> **Note**: Unlike later changes, this change's artifacts were authored directly into the archive folder by the implementation commit (`4eb56c07`) — no per-artifact engram observations exist for proposal/spec/design/tasks/verify-report. The filesystem copy is the authoritative record.

## FormatVersion Evolution (1 → 2)

| Aspect | v1 (base, `4eb56c07`) | v2 (evolution, `42deff4b`) |
|--------|------------------------|-----------------------------|
| `formatVersion` | `1` | `2` (`ExportOfflineRosterQuery.cs:33` const) |
| Per-user DTO | 12 fields, `Verifier` only | +`WrappedDek`, `WrapSalt`, `WrapIv` |
| Per-store key | — | `IStoreDataKeyProvider.GetDek(storeId)` — HKDF-SHA256(32B) from `StoreEncryption:MasterSecret`, called **once** per export |
| Per-user wrap | — | `IStoreKeyWrapService.WrapDek(hash, dek)` — PBKDF2 KEK (210K/SHA256) + AES-GCM-128, `Base64(ct ‖ tag)`, called **per user** |
| E2E tests | 4 scenarios | 7 (added: empty store, nonexistent store, DEK stability) |
| E2E suite | compiled only (not executed at v1 verify time) | **237/237 passing** |

Why: the frontend needs each roster user to be able to decrypt the shared roster file offline; the DEK is wrapped to each user's password-derived key so the master never travels or is stored server-side.

## Files Archived

| File | Action | Status |
|------|--------|--------|
| `openspec/changes/archive/2026-07-29-offline-auth-backend/proposal.md` | Pre-existing | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/design.md` | **Updated** — FormatVersion=2 refs + Post-Verification Evolution section | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/specs/offline-auth/spec.md` | **Updated** — FormatVersion 2, R10–R13, superseded-by-main-spec note | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/tasks.md` | **Updated** — 15/15 `[x]`, per-task status, evolution note | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/verify-report.md` | **Regenerated** — PASS (was PASS WITH WARNINGS) | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/apply-progress.md` | **Created** | ✅ |
| `openspec/changes/archive/2026-07-29-offline-auth-backend/archive-report.md` | **Created** | ✅ |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| offline-auth | Already synced (commit `42deff4b`) | `openspec/specs/offline-auth/spec.md` — R4 modified (formatVersion=2), R5 modified (+wrap fields), R10–R13 added (DEK derivation, wrapping, handler integration, format bump). Delta in this folder is superseded. |

## Verification

- **Verdict**: PASS — 17/17 scenarios compliant (was 11/13 + 2 partials under v1)
- **Tasks**: 15/15 complete
- **Tests**: 15 offline-auth unit tests (9 base + 6 evolution) + 7 E2E scenarios; full suite 510/510; E2E suite 237/237
- **Warnings closed**: R7/R8 coverage gaps → 2 new E2E tests; E2E DTO missing fields → `RosterUserData` completed
- **Build**: 0 errors

## Related Changes

- `2026-07-29-at-rest-encryption-backend` — DEK-wrapping evolution (delta spec + design) merged into the same main spec domain.
- `2026-07-29-offline-auth-frontend` — frontend consumption of the roster bundle (provisioning, offline login).

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Ready for the next change.
