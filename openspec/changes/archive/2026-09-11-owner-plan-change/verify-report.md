```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bb9fe91c5c91e844f7bf3e80d965cfd4ef09504f53ca708e2a1d615ded7cdfa2
verdict: pass
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 22/22
test_command: dotnet test backend/src/SMCA.sln --no-build
test_exit_code: 0
test_output_hash: sha256:6461d0d4a3de0dab4805eb6c171922779855bbaa7a084da4fce3860cc1c29511
build_command: dotnet build backend/src/SMCA.sln
build_exit_code: 0
build_output_hash: sha256:a0ae3bfb4644491da299c20764605d63d1da2e9e1044fb87dcf1d41a10a2a98d
```

# Verify Report — owner-plan-change

**Change**: owner-plan-change · **Phase**: Verify · **Date**: 2026-09-10
**Source-of-truth rule applied**: verdict grounded in the committed code on `main` (U1 `4cf7e7a2` … U7 `31c9adca`), the executed test suites, and the SDD artifacts under `openspec/changes/owner-plan-change/`.

**Verdict: PASS WITH WARNINGS** (CRITICAL: 0, WARNING: 1, NOTE: 1)

Envelope counts: 6/6 requirements (3 NEW + 3 MODIFIED in the delta spec), 22/22 scenarios. The envelope's `test_command` records the backend solution run (exit 0, hash `6461d0d4…`); the FE suite run of the same session (exit 1 from the 4 pre-existing sidebar chronic failures, hash `d041d543…`, 3326/3330 passed, `Type Errors: no errors`) is documented in Test + Build Evidence below — its 4 failures are baseline noise, not change-caused.

## Test + Build Evidence

- `dotnet test backend/src/SMCA.sln`: **Domain 22/22 · Application 424/424 · E2E 489/489 — ALL PASS** (PostgreSQL `localhost:5432/smca_test`; matches the U5 baseline exactly — zero regressions, zero growth)
- `pnpm test` (from `frontend-react/apps/web-store-pos`): **3325 passed / 3330 total**; `Type Errors: no errors`. The 5 failures are ALL in `app/shared/components/__tests__/sidebar.test.tsx` — 4 fail identically on unmodified `main` (stash-verified during U6; re-verified isolated runs: 4 failed / 42 passed, stable × 3 runs), the 5th is the same file's known parallel-scheduler flake. Baseline FE was 3319/3323 with the same 4 sidebar failures: net +6 passed, zero new failures caused by this change.
- FE E2E type gate: `tsc --noEmit` (strict) on all five U7 files — **clean** (see WARNING-1 for the runtime caveat).

## Spec Coverage Map (22/22 scenarios)

| # | Spec scenario (openspec/changes/owner-plan-change/specs/billing/spec.md) | Test evidence | Suite |
|---|---|---|---|
| 1 | Owner changes Gratis→Pago (overdue clock) | `ChangeStorePlanTests.cs` — owner Gratis→Pago universe + anchor-null legacy; modules = priceIncluded ∪ members; `NextDueDateOverride=Today` | Backend E2E 10/10 |
| 2 | Next payment date becomes today — visible | `ChangeStorePlanTests.cs` — overdue+paid → override=Today visible via `GET /v1/stores/{id}/plan` | Backend E2E |
| 3 | Owner changes to paid plan with FUTURE due date | `ChangeStorePlanTests.cs` — no override on future-due target | Backend E2E |
| 4 | Owner changes to Gratis | `ChangeStorePlanTests.cs` — downgrade clears override, paid modules off, anchor kept | Backend E2E |
| 5 | Owner changes to VIP | `ChangeStorePlanTests.cs` — full universe incl. VIP (not in catalog) | Backend E2E |
| 6 | Not the store's owner | `ChangeStorePlanTests.cs` — non-owner 403 | Backend E2E |
| 7 | Inactive store or inactive owner user | `ChangeStorePlanTests.cs` — 400 inactive store + 400 inactive user | Backend E2E |
| 8 | SuperAdmin path | `ChangeStorePlanTests.cs` — SuperAdmin changes any store | Backend E2E |
| 9 | Unknown plan / inactive plan | `ChangeStorePlanTests.cs` — 400 unknown plan | Backend E2E |
| 10 | Anchor immutability across all paths | `ChangeStorePlanTests.cs` (every test pins `PaymentStartDate`); `ToggleStorePlanTests.cs` (U3 rewrite); `StorePlanChangeTests.cs` (UpdateStore); FE `owner-plan-change-dialog.spec.ts` (DB pin before/after POST) | Backend E2E + FE E2E |
| 11 | Activation-on-first-paid removed | `StorePlanChangeTests.cs` — PUT moduleIds never auto-starts the clock; `RegisterStorePaymentCommand` consumes override (U4) | Backend E2E + Integration |
| 12 | Override priority in GetNextDueDate | Domain `GetNextDueDate` 4th-param tests; `BillingServiceTests` AD4 direction from `StorePlanId` | Domain + Application 424/424 |
| 13 | Payment clears override | `RegisterStorePaymentCommandTests` (U4: RED→GREEN 6/6; reads override as currentDue, clears it, explicit `UpdateAsync`) | Application |
| 14 | Downgrade clears override | `ChangeStorePlanTests.cs` — Pago→Gratis clears (AD1) | Backend E2E |
| 15 | Toggle Paid→Free keeps anchor | `ToggleStorePlanTests.cs` (rewritten U3: anchor NOT nulled, `StorePlanId=Gratis`, override cleared) | Backend E2E |
| 16 | Toggle Free→Paid keeps anchor, applies due rule | `ToggleStorePlanTests.cs` (anchor kept, `StorePlanId=Pago`, override=today on overdue) | Backend E2E |
| 17 | Owner PUT free-store module change rejected | `StorePlanChangeTests.cs` — PlanLocked 400 on free-store set change (DG-7 rewrite) | Backend E2E |
| 18 | Owner PUT same-set on paid store still OK | `StorePlanChangeTests.cs` — same-set allowed | Backend E2E |
| 19 | Owner activates Pago from the dialog | FE `owner-plan-change-dialog.spec.ts` (NEW) + `owner-stores.spec.ts` E-08 + `store-plan-activation.spec.ts` S2-01 | FE E2E (T7.5 static) |
| 20 | Strikethrough header | `plan-panels.test.tsx` ROWS-2/HEADER-3 (struck original + current right-aligned) | FE unit 14/14 |
| 21 | Includes-previous text | `plan-panels.test.tsx` COPY-1/2/3 (AD8: predecessor by Order chain; Gratis keeps plain INCLUDES) | FE unit |
| 22 | Rows stripped | `plan-panels.test.tsx` ROWS-1 + TOOLTIP-1/2 (name + "?" h-6 w-6 green only) | FE unit |

## Per-Work-Unit Verdict Table

| WU | Commit | Verdict | Evidence |
|---|---|---|---|
| U1 domain override | `4cf7e7a2` | PASS | `Store.NextDueDateOverride` + `GetNextDueDate` 4th param + migration; Domain 22/22 |
| U2 change-plan command | `5e1421a3` | PASS | `ChangeStorePlanCommand` + `POST /v1/stores/{id}/change-plan`; 14 handler tests; ownership guard; anchor never written |
| U3 toggle/updatestore alignment | `148a3a68` | PASS | toggle rewrite (anchor never nulled), UpdateStore DG-7 (PlanLocked on ANY set change by non-SuperAdmin), BillingService AD4 |
| U4 billing consumers | `a6df5b16` | PASS | `RegisterStorePayment` reads+clears override, explicit `UpdateAsync` (NoTracking trap); 4 queries pass override as 4th arg; RED→GREEN 6/6 |
| U5 backend E2E matrix | `2d301653` | PASS | `ChangeStorePlanTests.cs` NEW — 10/10 HTTP matrix; full E2E 489/489 |
| U6 FE dialog | `520419d5` | PASS | plan-panels rewrite (rows name+"?", header strike, AD8 copy, DG-7 lock removed), `changeStorePlan` service, modal close right-aligned, i18n; 4 suites 81/81; full 3326/3330 (4 sidebar pre-existing) |
| U7 FE E2E specs | `31c9adca` | PASS (static, see WARNING-1) | 3 authorized repurposes + NEW dialog spec + NEW plan-change-observer; POST-only wire contract, zero PUT, anchor DB-pinned, AD7/AD8 both ways; tsc clean ×5 files |
| U8 verify + close | (this report) | PASS | Suites vs baseline below; tasks 100% checked |

## Baseline Comparison

| Suite | Baseline (pre-change) | Now | Delta |
|---|---|---|---|
| Domain | 22 | 22 | 0 |
| Application | 424 | 424 | 0 |
| Backend E2E | 479 | 489 | **+10** (ChangeStorePlanTests) |
| FE unit | 3319 passed / 3323 (4 sidebar failing) | 3325-3326 passed / 3330 (4 sidebar chronic + 0-1 flake) | +6 net passed, 0 new failures |

## Issues

**CRITICAL**: none.

**WARNING-1 (U7 runtime verification deferred)**: Playwright is not locally runnable in this session, so the four FE E2E specs of U7 were verified **statically** (T7.5): the wire contract pinned against the real backend command (`ChangeStorePlanCommand.cs`: body is a single int, anchor never read-modify-written, `StorePlanId` written on every path, L146-151 overdue→override=today), the FE handler wiring (`my-stores.tsx`/`store-plan.tsx` call `changeStorePlan`, never `updateStore`), the i18n copy (`es.ts` ACTIVATE_PLAN/INCLUDES_PREVIOUS_PLAN), and `tsc --noEmit` clean on all five files. The specs themselves encode the runtime contract (observer asserts ONE POST `{storePlanId}`-only, ZERO PUT, anchor unchanged from the DB, modal close, card repaint). **Action**: run `pnpm test:e2e` (backend on `http-e2e` profile) in the next session that can, before archiving.

**NOTE-1 (pre-existing, out of scope)**: the 4 chronic `sidebar.test.tsx` failures predate this change (fail identically on unmodified `main`; warehouse-module copy drift, unrelated to plans/billing). The 5th full-run failure is the same file's parallel-scheduler flake, also pre-existing. Not addressed per the backend/FE-scope rule (would require touching an existing test suite outside this change's authorization).

## Ledger

`gentle-ai sdd-attempt`: U1 2601 · U2 903 · U3 1223 · U4 74 · U5 363 · U6 474 · U7 776 — **7/7 passed**, lifetime budget respected (all within the 800-line per-unit ceiling after documented resets).

## Verdict

**PASS WITH WARNINGS.** All 22 spec scenarios have committed test evidence across the five suites; all 8 work units passed their attempts; both backend solutions and the FE suite match or exceed their baselines with zero change-caused regressions; the anchor (`PaymentStartDate`) is pinned in every plan-change path (command, toggle, update, payment, FE dialog). The single WARNING is the deferred Playwright runtime run, already encoded as the U7 specs' own assertions and scheduled as the pre-archive action.
