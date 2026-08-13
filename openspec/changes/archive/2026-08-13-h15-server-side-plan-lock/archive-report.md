# Archive Report: h15-server-side-plan-lock — Server-side DG-7 one-way plan lock in UpdateStoreCommandHandler

**Change**: `h15-server-side-plan-lock`
**Archived**: 2026-08-13
**Branch**: `feat/h15-server-side-plan-lock`
**Artifact store**: hybrid (openspec filesystem + Engram)
**Archived to**: `openspec/changes/archive/2026-08-13-h15-server-side-plan-lock/`
**Archive mode**: normal (no partial archive; one documented Engram task-snapshot reconciliation — see Final State → Tasks)

## Summary

Closed: DG-7 ("plan activation — owner, once") is now a SERVER guarantee, not a UI-only barrier. `UpdateStoreCommandHandler` rejects module-set changes by non-SuperAdmin callers on stores with any active paid module (`!IsSuperAdmin && store.StoreModules.Any(sm => !sm.ModulePriceIncluded)` + distinct-sorted `SequenceEqual` → `ValidationException` with code `PlanLocked`, HTTP 400), zero extra queries — the handler already loads active `StoreModule` rows with `ModulePriceIncluded` via `GetStoreByIdIncludingModulesAsync`. Same-set updates stay allowed, free-store activation stays allowed, SuperAdmin retains full edit; trigger is modules, NOT `PaymentStartDate` (the rejected "once non-null" proxy). The S2-01 seeding fixture was rewritten from a plan-downgrade PUT (which the lock now rejects) to direct-DB `pg` seeding. Angular legacy edit form plan edits on paid stores now receive 400 + `PlanLocked` — accepted consequence, documented in the spec, no Angular code change.

## Requirements Delivered (final state, all COMPLIANT)

| Req | Delta action | Final rule | Evidence |
|-----|--------------|------------|----------|
| R1 | MODIFIED (`billing` — `Store.PaymentStartDate` Lock row) | Trigger is modules: while the store has ANY active paid module, OwnerAdmin MUST NOT change modules (distinct-sorted set equality; duplicates/order never reject) → `ValidationException` 400 code `PlanLocked`; same-set allowed; free activation allowed; SuperAdmin carve-out; trigger is modules, not `PaymentStartDate` | `UpdateStoreCommand.cs:78-92` guard; `StorePlanLockTests.cs` 4/4 E2E (400 lock, rename-only 200, free activation 200, SuperAdmin 200); `UpdateStoreCommandHandlerLockTests.cs` 4/4 unit |
| R2 | ADDED (`billing` — accepted consequence) | Legacy Angular edit form (`edit-store.component.html:99-100`) plan edits on paid stores receive 400 + `PlanLocked`; accepted, companion guard deferred, no Angular code change | Documented consequence; backend rejection runtime-proven via the same guard branch as R1's scenario 7 (request shape is client-agnostic) |

## Final State (close-of-cycle, per Final-State Authority)

- **Status**: CLOSED.
- **Apply**: 3 work-unit commits on `feat/h15-server-side-plan-lock` — `5a28e0e3` `feat(store): enforce DG-7 plan lock for paid stores` (handler guard + 2 resx keys + 4 new unit tests), `9995359f` `test(e2e): cover plan lock on PUT /stores/{id}` (new `StorePlanLockTests.cs`, 4 tests, ADD-only), `bc50f45c` `test(e2e): seed free plan via direct DB` (authorized `store-fixture.ts` support-file rewrite: PUT → direct-DB `pg` seeding). `49b45eb7` `docs(testing): mark S2-03 delivered, B-6 resolved, S1-02 rate-limit note corrected` is a SEPARATE concern on the same branch — ALREADY committed, NOT part of this change, NOT included in the archive commit.
- **Verify**: PASS — **2/2 requirements, 12/12 scenarios, 0 blockers**. Evidence revision `sha256:79ac5e7ae86d13bf64d2ab5497b2d47b6f4c8c094f3fb7132ada918059a21e22` (per `verify-report.md` and Engram #793).
- **Test evidence (final, per verify-report #793 and the launch-prompt handoff)**: unit lock filter **4/4**; new E2E lock **4/4**; regression pins (StoreUpdate/StoreAuthorization/StoreCreationTrial) **37/37**; full backend E2E **354/354**; Application **341/341** (incl. 4 new lock unit tests); Domain **22/22**; `dotnet build backend/src/SMCA.sln` **0 errors**; frontend `store-plan-activation.spec.ts` **2/2** — all against real PostgreSQL `smca_test` (frontend against real backend `http://localhost:5019`).
- **Findings**: CRITICAL 0. WARNING 0. SUGGESTION 0 blocking.
- **Informational verify notes (carried as final)**: (1) scenario 11 (legacy paid store, null clock, stays locked) — no test arranges a paid store with `PaymentStartDate = null` before the OwnerAdmin module-change PUT; coverage rests on branch equivalence with scenario 7 (the guard never reads `PaymentStartDate`); optional hardening noted, not a defect. (2) scenario 12 (Angular legacy 4xx) — accepted consequence with deliberately no Angular-side test or code change; backend rejection runtime-proven via scenario 7. Both non-blocking, no action required at close.
- **Design decisions**: all followed — D1 set-change trigger on paid store (not clock proxy, not filter-level), D2 distinct-sorted equality (duplicates/order never reject), D3 `ValidationException` + `PlanLocked` → 400 (403 remains the identity-guard contract), D4 paid check from already-loaded `StoreModules` `ModulePriceIncluded` (query-free guard), D5 placement immediately after null-store guard before duplicate-name check, D6 S2-01 seeding option (B) direct-DB `pg` (login #6 → 429 avoided).
- **Scope gate**: `git show` of the 3 commits — handler +16, new unit test file +276, `I18n.resx` +3, `I18n.en.resx` +3, new `StorePlanLockTests.cs` +119, `store-fixture.ts` +79/-49 (the single authorized support-file modification). No existing backend E2E test, frontend spec, or other E2E support file touched; no Angular (`frontend/`) change; no React app/package change; no rate-limit work.
- **Out of scope (documented, pre-existing)**: Angular legacy companion guard; React UI (already `readOnly`); rate-limit/refresh (H-13); merge/PR delivery.

## Spec Sync (delta → main spec)

`billing` — the delta was NOT merged by the spec phase: the main spec still carried the stale Lock row ("Once non-null, OwnerAdmin cannot change modules...") and only 6 scenarios. Archive performed the merge into `openspec/specs/billing/spec.md` (delta content applied verbatim; verified all 12 delta scenario blocks present byte-identical in the merged spec, CRLF-consistent):

1. **1 MODIFIED requirement** — `Store.PaymentStartDate`: Lock row replaced with the modules-trigger rule (`ModulePriceIncluded == false` + distinct-sorted set equality → 400 `PlanLocked`; same-set/free-activation/SuperAdmin carve-out); provenance note updated to "(Previously: the Lock row read "Once non-null..." — the `PaymentStartDate` proxy.)"; 5 new scenarios added under the same requirement (OwnerAdmin module change rejected, same-set allowed, free activation, SuperAdmin carve-out, legacy null-clock stays locked) — the 6 pre-existing scenarios preserved untouched.
2. **1 ADDED requirement** — "Angular legacy plan edits 4xx on paid stores (accepted consequence)" appended with its scenario (Legacy-app plan edit on paid store rejected → 400 + `PlanLocked`).
3. No REMOVED / RENAMED requirement blocks in the delta — no deletions performed, no destructive merge warning needed. `git diff` of the merge: +36/−2 lines, only the Lock row, provenance note, and appended scenarios/requirement.
4. All 12 delta scenarios verified present verbatim in the merged main spec (line-ending-normalized comparison); main spec remains CRLF-consistent (0 bare LF).

## Archive Move

Change folder moved to `openspec/changes/archive/2026-08-13-h15-server-side-plan-lock/` via shell `Move-Item` (folder untracked — `git ls-files` empty, `git mv` not applicable; same as b3-login-roundtrip, login-wrapped-dek and s2-03 precedents). Mandatory `diff -r` readback (pre-move recursive snapshot vs archived tree, using Git-for-Windows `C:\Program Files\Git\usr\bin\diff.exe`): **empty output, exit 0 — byte-identical**. All 7 artifacts archived: `exploration.md`, `proposal.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `specs/billing/spec.md` (+ this additive `archive-report.md`). Active `openspec/changes/` no longer lists the change.

## Tasks (completion gate + reconciliation)

Archived filesystem `tasks.md`: **16/16 tasks checked `[x]`, ZERO unchecked implementation tasks** (verified by line scan of the archived file).

**Reconciliation note**: the Engram `sdd/h15-server-side-plan-lock/tasks` observation (#790) is the tasks-phase snapshot (persisted 19:14, pre-apply) and still shows unchecked boxes; the apply phase updated the filesystem `tasks.md` (all `[x]`) but did not upsert the Engram topic. Final completion is proven by the archived filesystem `tasks.md` (byte-verified, 16/16 checked), apply-progress #792 ("Tasks completed (16/16)"), and verify-report #793 (completeness table: 16 total, 16 complete, 0 incomplete). The archived audit trail contains no stale unchecked tasks; #790 is historical intermediate state, not the terminal record. No archive-time stale-checkbox reconciliation was needed — the filesystem artifact was already complete.

## Config

`openspec/config.yaml` was NOT modified. The login-wrapped-dek close already updated the context block with the project-mandated rules (E2E untouchable, backend additive-only) and the Playwright E2E testing commands; the h15 close introduces no new project context, stack facts, or commands (matches the b3 close precedent — config untouched).

## Engram Lineage (observation IDs)

Prior change observations read/verified this archive run (via Engram search + full retrieval): proposal **#787**, spec **#788**, design **#789**, tasks **#790** (pre-apply snapshot — see reconciliation note above), apply-progress **#792**, verify-report **#793**. No separate Engram exploration observation was found (search returned none); the filesystem `exploration.md` is archived with the folder. This archive report persisted as topic `sdd/h15-server-side-plan-lock/archive-report` (type architecture, capture_prompt false).

**Open memory issue (flagged)**: Engram observation **#91** — "H-15 apply-progress: COMPLETE — all phases green, 3 commits landed" — is stored under `project: ams-suite`, `topic: sdd/junit5-migration-scaleout/explore`, `created 2026-06-19`: an EARLIER mis-targeted `mem_update` overwrote an ams-suite observation with H-15 apply-progress content. The correct H-15 apply-progress record is #792 (topic `sdd/h15-server-side-plan-lock/apply-progress`, project store-mgmt). #91's misplacement is pre-existing collateral damage from an earlier session; it does not affect this change's audit trail but is left as an open memory-hygiene issue for the owner to repair (no automated fix attempted by archive).

## Delivery

Commit-only on `feat/h15-server-side-plan-lock` per session preflight — NO PR, NO push. Final archive commit stages ONLY h15 openspec planning/archive artifacts: `openspec/specs/billing/spec.md` (synced main spec) and `openspec/changes/archive/2026-08-13-h15-server-side-plan-lock/`. Source/test/fixture files are NOT staged (already committed in `5a28e0e3`, `9995359f`, `bc50f45c`); the `49b45eb7` docs/testing change is owned by a separate concern and is not staged. Conventional commit, no AI attribution.