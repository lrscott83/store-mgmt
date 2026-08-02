# Archive report: at-rest-encryption-frontend

Artifact store: hybrid. Engram topic key: `sdd/at-rest-encryption-frontend/archive-report`.
Archived: 2026-08-02. Branch: `feat/at-rest-encryption-frontend`, 25 commits, cut from `main`,
never pushed, tree clean at archive time.

## Status: ARCHIVED — with a deliberate, recorded orchestrator override of a BLOCKED verify verdict

`sdd-verify` returned **BLOCKED, 1 CRITICAL**. The orchestrator reviewed that CRITICAL against the
code directly and **overrode it** to allow archiving. This report exists to make that override
honest and traceable — it is not dropped, softened, or hidden.

## The override — what was overridden and why

**The CRITICAL** (full text preserved in `verify-report.md` in this folder): the DEK-wrap
Known-Answer-Test fixture,
`frontend-react/apps/web-store-pos/app/shared/lib/offline/__tests__/__fixtures__/dek-kat.json`,
carries `"provenance": "node-transcription"` — a Node.js transcription of
`StoreKeyWrapService.cs`/`StoreDataKeyProvider.cs` — rather than a vector genuinely produced by
running the real .NET backend. `unwrapDek` (now live in production via `auth-store.ts` and
`offline-auth-service.ts`) has therefore never been checked against a real backend-produced
`wrappedDek`/`wrapSalt`/`wrapIv`/expected-DEK tuple.

**Why this is not a code defect.** `sdd-verify` itself, independent of this override, found:
- Zero spec/code drift across all 25 requirements in the 5 delta specs.
- All test evidence load-bearing (non-vacuous) — crypto seam tests read raw `localStorage` bytes
  and assert on the ciphertext prefix and byte-identity across failed locked reads; `auth-store
  .dek.test.ts` builds real wrapped-DEK fixtures with the SAME primitives production code uses and
  asserts the recovered DEK bytes match exactly.
- No mock-only assertions standing in for real behavior.
- All TDD RED evidence genuine (real `Failed to resolve import`, real `TypeError`, a real
  `MissingDataKeyError` propagating through `resolveUserHomePath` before the unlock gate existed).

The CRITICAL is entirely about the **provenance of one test fixture**, not about any function,
call site, or test being wrong.

**Why it cannot be closed in this environment.** Producing a genuine .NET-backend vector requires
running `StoreKeyWrapService`/`StoreDataKeyProvider` directly. In this sandbox: `dotnet` is not
installed, and the Docker daemon rejects this user — there is no path to bring up the backend
here. This is not frontend work: task 3.3 in `tasks.md` itself begins "Bring up the backend",
correctly scoping it outside this change's own capability.

**Why the gap now has an owner.** `docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md`
(committed as `414a78e`) exists specifically to close this. Its Tasks 1-3 produce and commit a
genuine `dotnet-backend`-provenance KAT vector on the backend side; its Task 4 records the
resulting two-line frontend follow-up (swap the fixture's `provenance` label and backend commit
SHA, confirm `dek-unwrap.kat.test.ts` still passes unmodified). This is a tracked, scoped,
two-line remaining diff — not an open-ended risk.

**Code evidence bounding the residual risk** (verified directly by the orchestrator, not taken on
the implementer's word):
- `ExportOfflineRosterQuery.cs:101-102` passes the **same** `su.User.Password` value to both
  `_offlineVerifierService.CreateVerifier(...)` and `_storeKeyWrapService.WrapDek(...)`.
- `OfflineVerifierService.cs:16-21` and `StoreKeyWrapService.cs:20-25` perform the **identical**
  derivation chain — PBKDF2-HMAC-SHA256, 210,000 iterations, SHA-256, 32-byte output, over the
  stored password hash — differing only in the salt used (verifier salt vs. wrap salt).
- On the frontend, `dek-unwrap.ts:48-49` calls the very same `sha256Base64` / `pbkdf2Base64`
  functions that the shipped, already-in-production `verifyOfflinePassword` path uses.

The KEK derivation the KAT is meant to validate is therefore **the same code path** as the
already-in-production, already-battle-tested offline verifier — it is not a fresh, unvalidated
crypto surface. The AES-GCM composition on top of it was separately cross-checked against
Node/OpenSSL during implementation (`apply-progress.md`, WU1 and WU3 sections: `gcm(key,iv)
.encrypt(pt)` confirmed byte-identical to `crypto.createCipheriv('aes-256-gcm', ...)` for fixed
vectors). What remains unproven is narrow — genuine byte-for-byte backend interop for the wrap
step specifically — and it is documented, tracked, and owned, not hidden.

## What sdd-verify found independent of the override (see verify-report.md for full detail)

- **0 WARNING.**
- **1 SUGGESTION** (non-blocking): `entity-migration.ts` was drafted before its test file in one
  batch; RED was reconstructed via move-aside/restore rather than a natural pre-implementation
  failure. Self-disclosed in `apply-progress.md`, methodologically sound, not a defect.
- All 25 requirements across the 5 delta specs (`offline-roster-bundle` +3, `entity-at-rest-
  encryption` 5, `dek-lifecycle-and-unlock-gate` 5, `entity-migration` 5, `at-rest-encryption-
  errors` 5) verified true against real code, not just tasks.md checkboxes.
- The standing hard constraint (offline-auth/at-rest-encryption strictly optional, obs #1549)
  genuinely tested across all six seams, both loaders, and the migration guard — not merely
  asserted in prose.

## Gate numbers — re-run by the orchestrator at HEAD, not taken from any agent's claim

| Gate | Baseline (before this change) | At HEAD (25 commits) |
|---|---|---|
| `pnpm typecheck` | 5/5 tasks | **5/5 tasks, exit 0** |
| `pnpm test` (web-store-pos) | 155 files / 2196 tests | **171 files / 2285 tests passed** |
| `pnpm test` (domain) | 95/95 | **95/95 passed** |
| `pnpm test` (web-common) | 11/11 | **11/11 passed** |
| `pnpm lint` | 4/4 packages | **4/4 packages, exit 0** |

Net: **+89 tests, +16 files**, zero regressions.

## Task completion

44 of 45 tasks complete. The one open task is **3.3** (real-backend KAT interop vector) —
deliberately deferred per its own tasks.md text, now owned by
`docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md` (commit `414a78e`).

## Work-unit spine as landed

WU0-4 (crypto primitives, dead code) → WU5-10 (the six data seams, 16 call sites — not 18, per
design correction 1: expenses and sale-credits have no raw `getXJson` getter) → WU12 (unlock gate,
landed first as an inert gate) → WU11 (auth wiring — the first real behavior change) → WU13
(eager migration) → WU14 (v2 fixtures + stale-comment cleanup). The first 1,705 lines across
WU0-10 were provably inert: no DEK is ever set until WU11, so every seam is a proven no-op in
plaintext mode until that commit.

`@noble/ciphers` pinned at exactly `2.2.0` (not the `1.3.0` originally proposed — corrected by the
user pre-batch), zero transitive dependencies; subpath imports require the `.js` extension (e.g.
`@noble/ciphers/aes.js`).

## Specs merged into the canonical tree

Canonical tree: repo-root `openspec/specs/` (NOT `frontend-react/openspec/`, which holds unrelated
older UI-parity changes and was not touched).

| Capability | Action | File |
|---|---|---|
| `offline-roster-bundle` | **MODIFIED** — merged 3 ADDED requirements into the existing capability, appended a "Verification Status" addendum noting the override | `openspec/specs/offline-roster-bundle/spec.md` |
| `entity-at-rest-encryption` | **NEW** | `openspec/specs/entity-at-rest-encryption/spec.md` |
| `dek-lifecycle-and-unlock-gate` | **NEW** | `openspec/specs/dek-lifecycle-and-unlock-gate/spec.md` |
| `entity-migration` | **NEW** — merged the CORRECTED wording (commit `951f509`, post-verify fix to the "unprovisioned guard" requirement so it doesn't demand a literal zero-storage-access claim the guard itself can't satisfy) | `openspec/specs/entity-migration/spec.md` |
| `at-rest-encryption-errors` | **NEW** | `openspec/specs/at-rest-encryption-errors/spec.md` |

Each new/modified canonical spec carries a "Verification Status" section citing this archive and
the override.

## Change folder archived

Copied `openspec/changes/at-rest-encryption-frontend/` (explore.md, proposal.md, design.md,
tasks.md, apply-progress.md, verify-report.md, specs/*, plus this archive-report.md and the
override addendum appended to apply-progress.md and verify-report.md) to:

`openspec/changes/archive/2026-08-02-at-rest-encryption-frontend/`

## What the orchestrator must still finish by hand

This agent has no Bash access and could not:
1. **Delete** the original (pre-archive) folder `openspec/changes/at-rest-encryption-frontend/` —
   it still exists alongside the new archive copy and must be removed.
2. **Commit** the archive (new files under `openspec/changes/archive/2026-08-02-at-rest-encryption-
   frontend/`, the deletion of the old folder, and the 5 canonical spec files
   created/modified under `openspec/specs/`) on the `feat/at-rest-encryption-frontend` branch, per
   this repo's standing commits-only convention.
3. Verify no other stray reference to the pre-archive path remains (none found by this agent, but
   not exhaustively grepped without Bash).

## Engram persisted

`mem_save` called with `topic_key: "sdd/at-rest-encryption-frontend/archive-report"`,
`type: "architecture"`, `project: "store-mgmt"`, `capture_prompt: false`, containing this same
override rationale and gate numbers for cross-session recovery.
