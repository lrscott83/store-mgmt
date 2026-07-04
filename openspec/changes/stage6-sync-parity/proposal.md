# Proposal: Stage 6 — Sync + PWA Cross-Cutting Parity

## Intent
Close Stage 6 of the Angular → React frontend parity audit for `frontend-react/apps/web-store-pos` (Angular `frontend/` is the sole source of truth). Stage 6 covers the Sync module (export/import backup) plus the deferred non-inventory PWA cross-cutting services (SW update cadence, usage tracking). The audit (engram #638) found the React sync serializer is a from-scratch reimplementation whose backup format is NOT interoperable with Angular, silently dropped Angular's store-scoped password security property, and bypasses ALL domain validation on import (can never fail, can silently create invalid state). It also found the client-side usage-tracker write-side is missing entirely and the SW update flow lacks Angular's periodic re-check. Two binding user decisions (engram #639) set direction: (1) full 1:1 Angular data-format interop, (2) restore domain validation on import. Fix the drift; do not preserve it.

## Scope

### In Scope

- **Slice A — Data format + import validation (LARGE, security-sensitive)** [TDD]
  - Rewrite `app/sync/lib/services/data-serializer-service.ts` to match Angular `data-serializer.service.ts` 1:1: use `@zip.js/zip.js` (NOT `fflate`), emit 6 separate password-protected AES JSON files (`products.json`, `categories.json`, `inventory-entries.json`, `orders.json`, `expenses.json`, `sale-credits.json`) via `ZipWriter` with zip.js native AES password support (WinZip AE spec), password = `userPassword + selectedStoreId`. This DROPS React's current single-envelope AES-GCM/PBKDF2-SHA256 (210k) scheme and restores Angular's store-scoping security property (a backup only decrypts on the same store id it was exported from).
  - Rewrite the import path in `app/sync/lib/services/data-synchronizer-service.ts` to route merge writes through the domain repositories (enforcing rules such as category name-uniqueness) with abort-and-revert semantics on first failure for products/categories, matching Angular `DataSynchronizerService`. Removes the current raw `BaseRepository<T>` bypass that can never fail.
  - Preserve React's existing no-write-on-failure guarantee (decrypt/parse before any write; `import-no-write.test.ts` must stay green) and surface merge-stage failures via typed errors.

- **Slice B — Sync forms L5/L6 (small)** [VISUAL + L6]
  - Rebuild `export-form.tsx` / `import-form.tsx` (and route wrappers) on the shared UI kit: `Card` (title = `SYNC.EXPORT_TITLE`/`IMPORT_TITLE`), `Button` variant `fab` (Angular `mat-fab extended`), `InfoBox` for result/error banners (replace raw `bg-green-50`).
  - Add a password show/hide toggle to both forms (Angular has the eye toggle on both `send-data`/`receive-data`); reuse/add an eye icon in `shared/components/ui/icons.tsx`.
  - L6: replace the untranslated raw `err.message` fallback with a translated catch-all key.

- **Slice C — Client-side usage-tracker write-side (independent)** [TDD]
  - Build the missing React equivalent of Angular `StoreUsageTrackerService`: hook React Router navigation (root-level effect / `useLocation`), buffer "active today" flags per-user in `localStorage` (`lizoft.store-daily-usage-{userId}` key parity), POST unsaved days to `/usages/store-daily-usage`, guarded by auth + non-empty-store check + a `sending` mutex. Scope by `userId` + `selectedStoreId` like Angular. React today has only the read-side (`admin/dashboard/lib/services/usage-http-service.ts`).

- **Slice D — SW update periodic check (tiny)** [VISUAL/mechanical]
  - Add an interval-based `registration.update()` poll (~15 min, matching Angular's `checkForUpdate()` cadence) to `registerServiceWorker()` in `root.tsx`. The core confirm/apply-update UX is already verbatim parity (Tier-0 Fix B); this only closes the "long-lived open POS tab goes stale" gap.

### Out of Scope (DEAD in Angular — document exclusion, no code)

- **Connection interceptor/service** (`connection-interceptor.service.ts`, `connection.service.ts`): decorator + DI registration + the sole login call site are all commented out. React's `useOnlineStatus()` hook already exceeds it (actively used in 7+ routes). No porting — the gap runs the other direction.
- **Download-manager service + download-progress UI**: `DownloadManagerService` runs a fake `Math.random()` progress simulation, and `<app-download-progress>` is never rendered in any template. Invisible dead UI. Not ported.
- **`SendDataComponent.shareData()`**: defined but never bound to any element. Dead method.
- **`MENU.SYNCHRONIZATION.{DOWNLOAD,SEND,RECEIVE}` vocab keys**: back a commented-out menu item. Dead vocab.
- **Cart UI / inventory-availability**: already closed in Stages 1 (Sales) and 2 (Inventory). NOT re-scoped here.

## Capabilities

### New Capabilities
- `sync-backup`: export/import backup at strict Angular parity — interoperable zip.js/6-file/password+storeId format, domain-validated import with abort-and-revert, shared-kit forms with password toggle.
- `pwa-usage-tracking`: client-side daily store-activity recording (write-side) feeding the already-ported admin usage dashboard read-side.

### Modified Capabilities
- `pwa-sw-update`: add periodic update polling to the existing SW registration flow.

## Approach
Four independent work-unit slices. **Slice A dominates the line budget and is architecturally/security-sensitive — it MUST pass through `sdd-design` before `sdd-tasks`** (crypto envelope change + data-integrity semantics). Slices B, C, D are smaller and can proceed after their own lightweight task breakdown; C and D are fully independent of the sync data-format work and could ship in parallel. Angular is the reference for every behavior; texts end IDENTICAL and in Spanish. Strict TDD Mode is active for behavior-changing slices (A, C).

## Affected Areas

| Area | Impact | Slice |
|------|--------|-------|
| `app/sync/lib/services/data-serializer-service.ts` | Rewritten (zip.js/6-file/password+storeId) | A |
| `app/sync/lib/services/data-synchronizer-service.ts` | Rewritten import path (domain validation + revert) | A |
| `package.json` (web-store-pos) | Add `@zip.js/zip.js`; drop `fflate` if unused elsewhere | A |
| `app/sync/components/export-form.tsx`, `import-form.tsx` (+ route wrappers) | Modified (Card/Button-fab/InfoBox + password toggle) | B |
| `app/shared/components/ui/icons.tsx` | Modified (eye/eye-off icon) | B |
| `app/shared/lib/i18n/es.ts` | Modified (catch-all error key) | B |
| New: React `StoreUsageTracker` equivalent + root wiring | Added | C |
| `root.tsx` `registerServiceWorker()` | Modified (periodic `registration.update()`) | D |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| zip.js AES password format not byte-compatible with Angular's WinZip AE output | Med-High | Slice A design must pin exact zip.js API + verify round-trip against a real Angular-exported `.zip` fixture before implementation |
| 6-file split ↔ React repository mapping mismatch (entity names/shapes differ Angular vs React) | Med | Design phase maps each of the 6 files to its React repo + serialization shape explicitly |
| Domain-validated revert semantics diverge from Angular (which entities revert vs only break) | Med | Design phase documents per-entity revert vs break-only (Angular reverts products/categories; inventory/orders/expenses/saleCredits break-only, revert commented out) |
| Dropping AES-GCM breaks any existing React-format backups in the wild | Low-Med | Open question for design: confirm whether any React-format `.zip` backups exist to restore; decide back-compat importer vs clean cutover |
| Total change well over 400 lines | High | Chained work-unit delivery, commits-only (no PR/push per session pattern); Slice A isolated from B/C/D |
| Usage-tracker POST retry/mutex races on rapid navigation | Med | TDD the buffer + mutex; mirror Angular's `sending` guard exactly |

## Open Questions for Design (especially Slice A)

1. **Exact zip.js API usage**: which `ZipWriter`/`ZipReader` options reproduce Angular's `password` + AES encryption strength/AE version byte-for-byte? Verify with a real Angular-exported fixture round-trip (Angular exports → React imports, and React exports → Angular imports).
2. **6-file → React repo mapping**: exact filename ↔ React repository/entity-shape mapping for all six (`products`, `categories`, `inventory-entries`, `orders`, `expenses`, `sale-credits`), including any field-name/shape differences that must be normalized to match Angular's JSON.
3. **Key derivation details**: confirm the precise `password + selectedStoreId` concatenation order/encoding Angular uses (raw string concat vs delimiter) so decryption is interoperable.
4. **Backward-compat with existing React-format backups**: do any AES-GCM/fflate `.zip` backups exist in the wild (e.g. created during the React migration window)? If yes, does Slice A need a legacy-format import fallback, or is a clean cutover acceptable? (User decision leans full-interop; confirm no legacy files stranded.)
5. **Per-entity revert vs break-only semantics**: replicate Angular exactly (products/categories revert whole map on first failure; inventory/orders/expenses/saleCredits break loop, no revert), or unify?
6. **Error taxonomy**: map Angular `SynchronizerErrors` (Products/Categories/Orders/InventoryUnexpectedError) to React typed merge-stage errors + i18n keys.

## Rollback Plan
Each slice is an isolated conventional commit on `feat/frontend-parity-audit`. Commits-only per session pattern — no push, no PR. Rollback is local `git revert`/reset per commit. Slice A's serializer/synchronizer rewrite is the highest-risk revert target and is kept in its own commit(s).

## Dependencies
- Slice A: `@zip.js/zip.js` dependency; a real Angular-exported `.zip` test fixture for interop verification.
- Slice B: shared `Card`/`Button`/`InfoBox` (already present from Stages 1–5).
- Slice C: `/usages/store-daily-usage` backend endpoint (already consumed read-side).
- Slice D: existing `registerServiceWorker()` / `virtual:pwa-register` (Tier-0 Fix B).
- Stage 6 dependency on Stage 0.2.1 (per tasks doc) already satisfied.

## Success Criteria
- [ ] React-exported backup imports cleanly in Angular and vice-versa (round-trip verified against a real Angular `.zip` fixture).
- [ ] Backup only decrypts on the same store id it was exported from (store-scoping restored); correct password on a different store fails.
- [ ] Import routes through domain repositories: duplicate-name category/product is rejected; products/categories revert on first failure; no-write-on-failure guarantee preserved (`import-no-write.test.ts` green).
- [ ] Sync forms use shared Card/Button(fab)/InfoBox; both have a working password show/hide toggle; no untranslated `err.message` leaks.
- [ ] Client-side usage tracker records daily activity and POSTs to `/usages/store-daily-usage`, scoped by `userId`+`selectedStoreId`, with mutex — admin dashboard shows live data.
- [ ] SW registration polls `registration.update()` on a ~15-min interval.
- [ ] Excluded dead-code items documented, not ported; tests green, tsc clean.
