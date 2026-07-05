# Archive Report — stage6-sync-parity

**Change**: stage6-sync-parity (Stage 6 Sync + PWA cross-cutting parity, branch feat/frontend-parity-audit)  
**Status**: ARCHIVED — Change is complete, verified, and closed.  
**Date Archived**: 2026-07-05  
**Artifact Store**: hybrid (Engram + openspec filesystem)

## Verification Summary

**Verdict**: PASS — All 32 tasks complete (8 phases, slices A/B/C/D), verification gates green (1232/1232 tests, tsc clean, build successful).  
**CRITICAL Issues**: 0  
**WARNING Issues**: 0  
**SUGGESTION Issues**: 2 (non-blocking, CSS implementation detail assertions on fab-variant Button)

## Artifacts Persisted

All artifacts from this change are now recorded with observation IDs for permanent traceability:

| Artifact | Observation ID | Topic Key | Status |
|----------|---|---|---|
| Proposal | 640 | sdd/stage6-sync-parity/proposal | ACTIVE |
| Spec | 641 | sdd/stage6-sync-parity/spec | ACTIVE |
| Design | 642 | sdd/stage6-sync-parity/design | ACTIVE |
| Tasks | 643 | sdd/stage6-sync-parity/tasks | ACTIVE |
| Apply-Progress | 647 | sdd/stage6-sync-parity/apply-progress | ACTIVE |
| Verify-Report | 653 | sdd/stage6-sync-parity/verify-report | ACTIVE |
| Archive-Report | (this) | sdd/stage6-sync-parity/archive-report | ACTIVE |

## Specs Synced

**Domain**: sync  
**Action**: Created main spec and merged delta spec  
**Details**: 
- CREATED new base spec at `openspec/specs/sync/spec.md` with all 15 requirements across 4 slices (Backup Format + Import Validation, Sync Forms, Usage-Tracker Write-Side, Service-Worker Update Polling)
- PRESERVED all requirements, scenarios, and out-of-scope exclusions from the delta spec
- Main spec now canonical authority for sync domain across all future implementations

**File Modified**: `openspec/specs/sync/spec.md` (NEW)

## Archive Contents (Preserved in openspec/changes/)

Following the archival convention established by previous changes (`audit-user-threading`, `audit-user-threading-followup`, `management-users-parity`, etc.), the change folder remains in place under `openspec/changes/` for reference and audit trail:

- `openspec/changes/stage6-sync-parity/proposal.md` ✅
- `openspec/changes/stage6-sync-parity/design.md` ✅
- `openspec/changes/stage6-sync-parity/tasks.md` ✅
- `openspec/changes/stage6-sync-parity/specs/sync/spec.md` ✅ (delta, now merged into main spec)
- `openspec/changes/stage6-sync-parity/verify-report.md` ✅
- `openspec/changes/stage6-sync-parity/archive-report.md` ✅ (this file)

## Source of Truth Updated

The main spec at `openspec/specs/sync/spec.md` now reflects the complete sync domain, including:

1. **Backup Format (Slice A)** — 6 password-protected AES JSON entries, store-scoped decryption, Angular interop, domain-validated import with abort-and-revert for products/categories
2. **Sync Forms (Slice B)** — Shared Card/Button(fab)/InfoBox kit, password show/hide toggle, translated error fallback
3. **Usage-Tracker Write-Side (Slice C)** — Daily store activity recording, localStorage buffer per user+store, buffered POST with mutex
4. **Service-Worker Update Polling (Slice D)** — Periodic registration.update() every ~15 minutes

## Implementation Verification

All 32 tasks completed and verified independently (see verify-report #653):

| Phase | Slice | Status | Details |
|-------|-------|--------|---------|
| Phase 1-2 | A | ✅ PASS | Serializer rewrite: zip.js 6-entry AES format, password=userPassword+selectedStoreId, no encryptionStrength override |
| Phase 3 | A | ✅ PASS | Synchronizer rewrite: categories-first merge order, name-uniqueness guard, whole-type revert for categories/products, break-only for inventory/orders/expenses/saleCredits, SyncResult aggregates errors |
| Phase 4 | A | ✅ PASS | Import/export wiring, fflate removed, Blob polyfill for jsdom, Angular's OrdersUnexpectedError bug FIXED (own error codes per angular-bugs-policy) |
| Phase 5 | C | ✅ PASS | Usage-tracker write-side: localStorage buffer, POST /v1/usages/store-daily-usage, module-level mutex, userId+selectedStoreId scoped |
| Phase 6 | D | ✅ PASS | Service-worker 15-min registration.update() poll extracted to testable registerServiceWorker() in service-worker-registration.ts |
| Phase 7 | B | ✅ PASS | Sync forms onto Card/Button(fab)/InfoBox kit, EyeIcon/EyeOffIcon password toggle, SYNC.ERROR_UNEXPECTED translated fallback |
| Phase 8 | — | ✅ PASS | Regression gate: grep confirmed zero fflate, zero raw err.message, zero OrdersUnexpectedError for expenses/saleCredits, synchronizer's repo.upsert guarded by name-uniqueness check + revert |
| Full test suite | — | ✅ PASS | 1232/1232 tests green (105 files), tsc clean, build successful (PWA precache 99 entries) |

## Changeset Summary

**Spec Files**:
- `openspec/specs/sync/spec.md` — NEW (created from delta spec)

**Implementation Files** (by sdd-apply, verified by sdd-verify, commits on feat/frontend-parity-audit):
- `apps/web-store-pos/app/sync/lib/data-serializer-service.ts` — zip.js rewrite
- `apps/web-store-pos/app/sync/lib/data-synchronizer-service.ts` — categories-first merge + revert logic
- `apps/web-store-pos/app/sync/routes/{export,import}.tsx` — wiring to new SyncResult contract
- `apps/web-store-pos/app/sync/components/{export,import}-form.tsx` — Card/Button/InfoBox kit + password toggle
- `app/shared/lib/usage/store-usage-tracker.ts` — daily activity tracking + POST
- `app/shared/lib/pwa/service-worker-registration.ts` — extracted + 15-min poll testable
- `vitest.setup.ts` — Blob polyfill for @zip.js/zip.js + jsdom
- `es.ts` — new i18n keys: SYNC.ERROR_UNEXPECTED, SYNC.SHOW_PASSWORD, SYNC.HIDE_PASSWORD
- `shared/components/ui/icons.tsx` — EyeIcon, EyeOffIcon
- Test files: data-serializer-service.test.ts, data-synchronizer-service.test.ts, import-no-write.test.ts, export-form.test.tsx, import-form.test.tsx, store-usage-tracker.test.ts, use-store-usage-tracker.test.tsx, service-worker-registration.test.ts

**Lines Changed**: ~550-750 (estimate ~550-750) — High scope, but split into 2 apply batches with commits-only delivery per exception-ok strategy.

**Commits** (all on feat/frontend-parity-audit, no PR/push):
- 3ddf48e feat(web-store-pos): rewrite sync serializer to zip.js AES 6-entry format
- ca7d85e feat(web-store-pos): rewrite synchronizer with categories-first merge + name-uniqueness guard + revert
- 68154b3 feat(web-store-pos): wire import routes to SyncResult contract, remove fflate
- 5f06fbc fix(web-store-pos): emit correct per-type sync error codes for expenses and sale-credits
- 055c75a feat(web-store-pos): add store usage tracker write-side (nav buffer + POST + mutex)
- 132c144 feat(web-store-pos): poll registration.update() every 15 minutes
- df2d21d fix(web-store-pos): sync forms UI kit parity + password toggle + i18n error fallback
- ea6abf9 docs(openspec): SDD artifacts for stage6-sync-parity (Stage 6 Sync + PWA)

## Key Decisions & Learnings

**Full Angular Interop** (binding decision #639): React sync serializer is now byte-interoperable with Angular's zip.js format (6 password-protected AES entries, no encryptionStrength override, password=userPassword+selectedStoreId plain concat). No backward-compat reader for legacy React AES-GCM/fflate backups — clean cutover since Angular is live source of truth.

**Domain Validation Restored** (binding decision #639): Import now validates through domain repositories (category/product name uniqueness), replacing raw BaseRepository bypass. Whole-type revert on first failure for categories/products only (mirroring Angular's actual behavior, which has revert commented out for other types).

**Angular-Bugs-Policy Applied** (binding decision #648): Angular has OrdersUnexpectedError used for Expenses/SaleCredits errors (copy-paste bug). This is FIXED in React — each entity type has its own error code. Verified by dedicated tests; convention documented in MEMORY.md.

**Fixture Decision** (binding decision #645): No real Angular fixture required for round-trip validation. Feature is unused by real clients. Fallback parity gate: verify zip.js API matches Angular format spec (6 entries, shapes, name order, AES defaults), with real-client-safe test (mock zip with known bytes).

**Jsdom Blob Polyfill**: jsdom's Blob is missing `.arrayBuffer()` and `.text()` methods needed by @zip.js/zip.js. Fixed via Blob.prototype polyfill using jsdom's own FileReader (NOT by replacing global Blob class, which breaks jsdom internals). Web-worker offloading disabled via configure({ useWebWorkers: false }) — pure execution strategy, no effect on produced ZIP bytes.

**Vite Virtual Module in Tests**: Vite's import-analysis plugin tries to eagerly resolve `import('virtual:...')` even inside `@vite-ignore` comments. Fixed by building the specifier at runtime (`['virtual','pwa-register'].join(':')`) so esbuild can't detect it as static-resolvable; production vite.config.ts unaffected.

**No-Write-on-Failure Preserved**: Decrypt/parse errors still fail before any repository write (existing guarantee from sync v1). New requirement applies only to validation failures after decryption succeeds.

## SDD Cycle Complete

This change is now fully **planned → specified → designed → implemented → verified → archived**. The sync domain is complete with full Angular interoperability, domain validation, and PWA polling. Ready for the next stage.

---

**Archive Decision**: Change folder remains in `openspec/changes/stage6-sync-parity/` (not moved to archive/ subfolder), matching convention established by sibling changes (`audit-user-threading`, `audit-user-threading-followup`, `management-users-parity`, `admin-features-parity`, `admin-owners-resellers-parity`, etc.). Engram observation IDs provide permanent traceability.

**Next**: No follow-up changes required. Stage 6 Sync + PWA parity is complete. Frontend-parity-audit may continue with Stage 7+ as needed.
