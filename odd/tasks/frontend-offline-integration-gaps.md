# Feature: frontend-offline-integration-gaps

**Objective:** Close the real coverage gaps in the React frontend offline services/repositories integration suite (Vitest, real `localStorage`, no mocks) and replace `docs/testing/integration-tests/README.md` with an accurate coverage matrix that lists what each test proves per service/repository. No online/API service is in scope.

**Status:** IN PROGRESS — tasks T0–T4. Work-unit commits on `qa`; push remains user decision.

## Problem

`docs/testing/integration-tests/README.md` claims "repositorios y servicios offline al 100%" for 8 modules. A fresh inventory (delegated mapper, 2026-09-25) confirmed those 8 are tested, but the doc is stale (says 35 tests; the set actually totals ~530) and under-scoped: it omits 5 offline services with tests (warehouse, recipe, elaboration, exchange-rate, channel-rate) and the whole DEK/offline infrastructure. Real gaps found:

- **A. Modules with NO test file (5):** `shared/lib/storage/decryption-failure-policy.ts`, `shared/lib/storage/storage-keys.ts`, `shared/lib/exchange-rates/exchange-rate-daily.ts`, `shared/lib/offline/offline-session.ts`, `shared/lib/hooks/use-pwa-install.ts`.
- **B. Services with tests but NO crypto test while importing `entity-crypto` (6):** `warehouse-offline-service` (82 tests, 1399 LOC), `recipe-offline-service`, `elaboration-offline-service`, `exchange-rate-offline-service` (management), `store-payment-methods-config-service`, `data-serializer-service` (read-only export path — verify actual encrypted-write surface before adding; skip if none).
- **C. Known, NOT in scope (needs explicit user authorization to touch):** duplicate `expense-offline-service.test.ts` (two locations, 31 vs 44 tests). Flag in final report; do not touch.

## Why

User request 2026-09-25: "suite completa de tests para el frontend de react para los servicios y repositorios... como tests de integración... que probaría cada test por cada uno de los servicios y repositorios (todo lo que sea frontend react, nada de los servicios online). revisa que en docs/testing hay cosas pero no se hasta que punto esta todo cubierto". Scope selected by user: **Cerrar gaps completos** = B crypto tests + A unit tests + refresh the docs matrix.

## Authorized scope

**Frontend only — `frontend-react/` (Angular `frontend/` never read/touched; backend never touched).**

- 6 NEW `*.crypto.test.ts` files co-located with the B services (pattern: provision DEK → write → read round-trip → integrity, following existing crypto tests like `channel-rate-offline-service.crypto.test.ts`).
- 5 NEW unit test files for the A modules.
- Refresh `docs/testing/integration-tests/README.md` as the coverage matrix (per-module method lists already exist; add: real test counts, per-test purpose summary, DEK crypto coverage column, real totals).
- NO existing test modified, deleted, renamed, skipped, or weakened. NO E2E touched (either suite). NO online service tested. NO production source modified.

## Tasks

- [x] T0 — Feature doc + Engram mirror (before first write).
- [x] T1 — Delegated writer: 6 crypto tests for B (verify data-serializer surface first; skip if no encrypted writes, report decision). **5 files created (22 tests), data-serializer SKIPPED by evidence. Commit `aae6d30d`.**
- [x] T2 — Delegated writer: 5 unit tests for A. **5 files created (66 tests). Commit `32298f53`. Discovery: `decryption-failure-policy.test.tsx` already existed (29 tests) — writer covered only the untested `logClientError` seam without touching the existing suite.**
- [x] T3 — Refresh `docs/testing/integration-tests/README.md` with real census + coverage matrix. **Rewritten: real counts, what-each-test-proves matrix, known issues, data-serializer verdict.**
- [ ] T4 — Checks (targeted vitest per new file, `pnpm --filter @store-mgmt/web-store-pos typecheck`, lint) + work-unit commits on `qa` + closing report.

## Route plan (per task; delivery budget advisory)

All tasks delegated (writer trigger: 2+ non-trivial files). Sequential writers, one at a time. Budget ≈ 400 authored lines/task advisory only. Commits: conventional, on `qa` branch (house convention), work-unit per batch; push after user decision.

## Checks

- `pnpm --filter @store-mgmt/web-store-pos exec vitest run <new-file>` per new file (or the `-- channel-rates`-style filter by path).
- `pnpm --filter @store-mgmt/web-store-pos test` full app suite (must stay green; new tests only add).
- `pnpm --filter @store-mgmt/web-store-pos typecheck` (0 errors).
- `pnpm --filter @store-mgmt/web-store-pos lint` (max-warnings=0).
- Re-verify NO existing test/E2E file appears in `git diff --stat` as modified (only new files + the README).

## Progress

- T0 committed? No (doc+mirror only, tracked with final docs commit).
- **T1 DONE (delegated writer, gate PASS, commit `aae6d30d`):** 5 NEW crypto test files → 22 tests:
  - `warehouse-offline-service.crypto.test.ts` (4): plaintext mode; enc:v1: round-trip on all 3 entity keys; locked read throws `MissingDataKeyError` (ciphertext byte-identical); locked write stops on encrypt seam.
  - `recipe-offline-service.crypto.test.ts` (4): plaintext round-trip; ciphertext fresh-instance round-trip; locked read throws preserves ciphertext; locked mutation blocked by read-before-write guard.
  - `elaboration-offline-service.crypto.test.ts` (4): confirmElaboration plaintext; ciphertext snapshot round-trip; locked read throws on both readers; locked confirmElaboration blocked before persist.
  - `exchange-rate-offline-service.crypto.test.ts` (5): plaintext; ciphertext round-trip (day keys + `value`); empty-payload short-circuit persists plaintext `'[]'`; locked reads throw; locked writes throw, ciphertext intact.
  - `store-payment-methods-config-service.crypto.test.ts` (5): plaintext; ciphertext round-trip disabled channel; backup seam ciphertext; **locked `getConfig()` degrades to default** (deliberate divergence pinned) while reader propagates `MissingDataKeyError`; locked write throws.
  - **data-serializer-service SKIPPED (evidence):** no entity-crypto/DEK/localStorage write path; export uses PBKDF2-SHA256 + zip.js `rawPassword` (different mechanism); at-rest encrypted writes belong to the 5 covered services. No file created.
  - Checks: 5/5 file runs PASS, full suite 308 files/4592 tests PASS, typecheck 0, lint 0, `git status` shows ONLY new files. Parent spot-check re-ran exchange-rate crypto test: 5/5 PASS.
- **T2 DONE (delegated writer, gate PASS, commit `32298f53`):** 5 NEW unit test files → 66 tests:
  - `decryption-failure-policy.client-log.test.ts` (9): the `logClientError` seam below `if (announced) return true;` latch — repeat failures swallowed with NO client-log trace. Discovery: brief was wrong — `decryption-failure-policy.test.tsx` already existed (459 LOC, 29 tests); writer did NOT duplicate, covered only the untested seam, existing suite untouched.
  - `storage-keys.test.ts` (13): key namespace contract, stable strings pinned.
  - `exchange-rate-daily.test.ts` (19): real localStorage store, real dynamic service import, no DEK → plaintext.
  - `offline-session.test.ts` (6): constants/shape; `*.purity.test.ts` convention.
  - `use-pwa-install.test.ts` (19): hook lifecycle (initial, prompt capture, install trigger, appinstalled, listener cleanup); real `pwa-install-prompt` store, only browser surface stubbed.
  - Checks: 5/5 file runs PASS (66), full suite 313 files/4658 tests PASS (delta exactly 66), typecheck 0, lint 0, `git status` only new files. Parent spot-check re-ran exchange-rate-daily: 19/19 PASS.
  - **Known flake profile (NOT reproduced, NOT fixed — needs auth to touch existing tests):** under machine load, `decryption-failure-policy.test.tsx` cold import and `sync-routes.test.tsx` share timeout blew 5000ms `testTimeout`; full green run does not reproduce.
- **T3 DONE (inline):** `docs/testing/integration-tests/README.md` rewritten as real census + coverage matrix (module tables with real counts, what-each-test-proves per service, known issues: duplicate expense test + flake profile, data-serializer verdict).
- T4 pending: final diff check + docs commit + closing report.

## Key references

- Existing crypto test pattern: `frontend-react/apps/web-store-pos/app/management/channel-rates/lib/services/__tests__/channel-rate-offline-service.crypto.test.ts`.
- Existing unit pattern: `docs/testing/integration-tests/README.md` §4 (localStorage.clear() + fixed store id + AAA).
- Inventory source: delegated mapper result (2026-09-25) — module/test tables in session.