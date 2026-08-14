# Tasks: Sync Export/Import Encryption v2

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 serializer → PR 2 UI/i18n/tests → PR 3 E2E |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Serializer v2 core + test redesign | PR 1 | `pnpm vitest run data-serializer-service` | N/A — jsdom unit | Revert serializer + test |
| 2 | i18n + UI catch + route/component tests | PR 2 | `pnpm vitest run import-form import-no-write` | N/A — component | Revert 4 files |
| 3 | E2E two-device spec + verification | PR 3 | `pnpm exec playwright test e2e/sync-export-import-v2.spec.ts` | `pnpm dev` + backend :3333 | Delete spec |

## Phase 1: Serializer Core (data-serializer-service.ts)

- [x] 1.1 Add `WrongStoreError`, v2 constants, `V2Meta`, `deriveV2Key()` (PBKDF2-HMAC-SHA-256, password-only, 32B). V2-01/03/04
- [x] 1.2 `export()`: meta.json FIRST unencrypted (fresh 16B `getRandomValues` salt, storeId, exportedAt); 6 entries with per-entry `{ rawPassword: key }`; keep `derivePassword()`. V2-01/02/04 ✔ vitest run data-serializer-service
- [x] 1.3 `import()`: passwordless reader; meta present → plaintext read, `meta.storeId !== storeId` → `WrongStoreError` pre-write; malformed meta → `CorruptFileError`; no meta → v1 fallback (password + storeId; WrongPasswordError unchanged). V2-05/06/07/12, SYNC-01/02

## Phase 2: Serializer Test Redesign (data-serializer-service.test.ts)

- [x] 2.1 Add `readRawEntriesV2()` + `getEntryText(options)` helpers; migrate ~12 `readRawEntries(PASSWORD+STORE_ID)` sites; v1 fixture: legacy ZipWriter. V2-01/07, SYNC-01
- [x] 2.2 T2 → 7 entries (meta `encrypted===false`, 6 encrypted), meta pinned, no key material; T3 → 32B key, 50000-iterations fixture honored, wrong pwd → different key / WrongPasswordError. V2-01/03/04/06
- [x] 2.3 T4 → `WrongStoreError` by name, NOT `WrongPasswordError`; v1-fallback round-trip + wrong pwd; empty-store v2 round-trip; salt differs per export; non-zip/corrupt → `CorruptFileError`. V2-02/05/07/11/12, SYNC-01/02 ✔ vitest run data-serializer-service

## Phase 3: UI + i18n

- [x] 3.1 `es.ts` (only locale file): add `SYNC.ERROR_WRONG_STORE`. V2-10
- [x] 3.2 `import-form.tsx` catch: `instanceof WrongStoreError` → `showBlockingError(ERROR_TITLE, SYNC.ERROR_WRONG_STORE)`; wrong-password stays generic. V2-10 ✔ vitest run import-form

## Phase 4: Route + Component Tests

- [x] 4.1 `import-no-write.test.ts`: ADD `WrongStoreError` case — `synchronizer.sync` NOT called. V2-09 ✔ vitest run import-no-write
- [x] 4.2 `import-form.test.tsx`: ADD `WrongStoreError` → dedicated message via `showBlockingErrorMock`. V2-10 ✔ vitest run import-form

## Phase 5: E2E (e2e/sync-export-import-v2.spec.ts, NEW)

- [x] 5.1 Device A: `plantRoster` + `seedCategoryAndProduct` (zero-login) → `/sync/export` → password → submit → `waitForEvent('download')` → save; Device B: `newContext({ serviceWorkers: 'block' })` → `plantRoster` same storeId → `/sync/import` → `setInputFiles` → password → submit → success toast → `/sales/products` product visible. V2-08
- [x] 5.2 Zero-login guard: `page.on('request')` `/v1/auth/login` → zero logins both devices; optional wrong-store negative (zero-login). V2-08 ✔ playwright e2e/sync-export-import-v2.spec.ts

## Phase 6: Verification

- [x] 6.1 `pnpm typecheck`
- [x] 6.2 `pnpm vitest run sync`
- [x] 6.3 `pnpm exec playwright test e2e/sync-export-import-v2.spec.ts`
