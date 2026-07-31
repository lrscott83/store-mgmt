# Tasks: Response Envelope Nullability (Discriminated Union)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | WU-A ~150-200, WU-B ~60-80, WU-C ~180-220, WU-D unknown until WU0 runs (base.ts+envelope.ts+probe+2 fixtures ~80 lines, PLUS every WU0-named file — could exceed 400) |
| 400-line budget risk | Low (A/B/C) / **High (WU-D, size unknown until WU0)** |
| Chained PRs recommended | N/A — delivery is commits-only, no PRs |
| Suggested split | Not applicable (commits-only); WU-D stays ONE commit regardless of size (indivisible, red-tree risk) |
| Delivery strategy | commits-only |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

Delivery is commits-only on `feat/response-envelope-nullability` — no PR splitting applies. The 400-line note exists only to flag WU-D as a large-but-indivisible commit, per design: a red tree between commits is worse than one large diff.

## Phase 0: WU0 — Enumeration Spike (NOT a commit)

- [ ] 0.1 Flip `packages/domain/src/models/base.ts` to the union, run `pnpm typecheck` from `frontend-react/`, save the FULL error list (this is the authoritative source for Phase 4.7 — the file table below is known-incomplete).
- [ ] 0.2 `git checkout -- packages/domain/src/models/base.ts` — revert. Nothing committed.

## Phase 1 (WU-A): owner-list / reseller-list / store-list guards

- [x] 1.1 RED: test `succeeded:false` on `ownerHttpService.listOwners()` renders `OWNER.ERROR`, `owners` unset.
- [x] 1.2 GREEN: guard at `owner-list.tsx:20-21`.
- [x] 1.3 RED: same for `reseller-list.tsx` → `RESELLERS.ERROR`.
- [x] 1.4 GREEN: guard at `reseller-list.tsx:19-20`.
- [x] 1.5 RED: same for `store-list.tsx` → `STORES.ERROR`.
- [x] 1.6 GREEN: guard at `store-list.tsx:28-29`.
- [x] 1.7 Gates green (`typecheck`/`test`/`lint --max-warnings=0`), commit WU-A.

## Phase 2 (WU-B): user-list guard

- [ ] 2.1 RED: `succeeded:false` inside `.then` → `USERS.ERROR`, `users` unset (not a rejection).
- [ ] 2.2 RED: `succeeded:true` still populates `users`, clears error (regression scenario).
- [ ] 2.3 GREEN: guard inside `.then` at `user-list.tsx:23-26`.
- [ ] 2.4 Gates green, commit WU-B.

## Phase 3 (WU-C): owner-edit — 3 guards, mixed idioms

- [ ] 3.1 RED: `getOwner` `succeeded:false` → `loadError=OWNER.ERROR`, no form setters called.
- [ ] 3.2 GREEN: guard at `owner-edit.tsx:141-144`.
- [ ] 3.3 RED: `loadStores` `succeeded:false` → dedicated `storesError=STORES.ERROR` (NOT `loadError`).
- [ ] 3.4 GREEN: guard at `owner-edit.tsx:85-93`.
- [ ] 3.5 RED: `listResellers` `succeeded:false` → `resellers` unset, NO new error UI (stays silent).
- [ ] 3.6 GREEN: `if (!res.succeeded) return;` at `owner-edit.tsx:162-165`.
- [ ] 3.7 Gates green, commit WU-C.

## Phase 4 (WU-D): type flip — INDIVISIBLE, one commit

- [ ] 4.1 `base.ts:13-19` interface → 2-branch discriminated union on `succeeded`; `message string|null`, `actionCode number|null` both branches; `errors: BaseError[]` stays non-null (ADR-1).
- [ ] 4.2 `envelope.ts:21` remove `null as unknown as T` → `data: null` in `failure()` (ADR-2); factories keep `message:''`/`actionCode:200|400`.
- [ ] 4.3 Add ADR-3 union-collapse `@ts-expect-error` probe to `envelope.test.ts`.
- [ ] 4.4 Annotate `user-home.test.ts:38` helper `: BaseResponseModel<boolean>`.
- [ ] 4.5 `register.test.tsx:85-92` failure fixture → `data: null`, drop fabricated payload.
- [ ] 4.6 Fix EVERY remaining file named by 0.1's compiler output — **this sub-list is not enumerable now; expand it verbatim from WU0 before starting 4.6, do not assume it's just 4.1-4.5**.
- [ ] 4.7 `pnpm typecheck`, `pnpm test`, `pnpm lint --max-warnings=0` green across all 4 packages.
- [ ] 4.8 ONE commit for all of WU-D, even if diff exceeds ~400 lines (red-tree between commits is disallowed by commits-only policy).

## Phase 5: Deferred to sdd-archive (not an apply task)

- [ ] 5.1 Flag for archive: correct `frontend-react/openspec/specs/admin/spec.md:312,596,1114` — `message`/`actionCode` become nullable; `errors` stays non-null. Do not move/merge/restructure either openspec tree.
