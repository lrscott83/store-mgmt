# Design: Response Envelope Nullability (Discriminated Union)

## Corrections to proposal / exploration

Every inherited claim was re-checked against source. Six did not survive.

| # | Inherited claim | Verified reality |
|---|---|---|
| C1 | `owner-edit.tsx` has **2** unguarded reads (`:141-144`, `:162-165`) | **3**. `loadStores()` at `owner-edit.tsx:85-93` also does `setStores(res.data)` (`:88`) with no `succeeded` check. Both explore and the brief missed it. Total is **6 unguarded sites in 5 files**, not 5. |
| C2 | An i18n key may be missing; watch the per-namespace voice | **No new key, no new copy.** All four exist: `es.ts:759 OWNER.ERROR`, `:737 RESELLERS.ERROR`, `:626 STORES.ERROR`, `:705 USERS.ERROR`. The voice split is real (`OWNER`/`RESELLERS` = voseo *"Intentá de nuevo"*; `STORES`/`USERS` = usted *"Intente de nuevo"*) — reusing each file's own key sidesteps it entirely. |
| C3 | `interface`→`type` fallout must be enumerated (D1) | **Zero structural fallout.** Grepped `frontend-react` for `extends BaseResponseModel`, `implements BaseResponseModel`, `Partial/Omit/Pick/Required/Readonly<BaseResponseModel`, `keyof BaseResponseModel`, indexed access `BaseResponseModel<…>[…]`: **no matches anywhere**. Single declaration at `base.ts:13` → no declaration merging. All 48 files use it only as a parameter/return/type-argument annotation, all legal for a union. |
| C4 | Risk = inline literals inferring `succeeded: boolean` (mitigate with `as const`) | The factories are **annotated** `: BaseResponseModel<T>`, so contextual discriminant typing keeps the tag literal — `as const` is unnecessary there. The real hazard is **unannotated helpers**. Concrete instance: `app/shared/lib/auth/__tests__/user-home.test.ts:38-40`, `function envelope(data: boolean) { return { …, succeeded: true, … } }` — no return annotation → `succeeded: boolean` → union-incompatible. |
| C5 | `pnpm -C packages/domain build` is needed whenever domain types change | Only for **scoped** runs and the editor. `turbo.json:13-15` gives `typecheck` `dependsOn: ["^build"]`, so root `pnpm typecheck` already rebuilds `packages/domain` (which publishes via `dist/index.d.ts`, `package.json:8`). |
| C6 | — (not raised) | **Live spec contradiction.** `frontend-react/openspec/specs/admin/spec.md:312`, `:596`, `:1114` each state "`BaseResponseModel<T>` fields `message`, `actionCode`, and `errors` are NON-nullable". `sdd-spec` MUST supersede those three lines: `errors` stays non-null; `message`/`actionCode` do not. |

**D6 confirmed.** `auth-store.ts:154-164` throws unconditionally inside `if (!response.succeeded) { … }`, so control-flow analysis narrows `response` to the `succeeded: true` branch at `:166`. **No `!`, no cast, no change.** Second free-narrowing confirmation: `reports/lib/pdf/generate-product-rows.ts:49-56` already ternaries on `.succeeded` and will narrow for free.

## Technical Approach

One type change in `packages/domain`, plus real behaviour guards at six call-sites. Ordering is inverted from the proposal: **guards land first under the old (lying) type, driven by behaviour RED tests; the union lands last.** By then the six sites already narrow correctly, so the type flip produces zero new errors there and every commit is green.

## Architecture Decisions

### ADR-1 — `interface` → `type` union (D1)

**Choice**: replace `base.ts:13-19` with the two-branch union; keep `errors: BaseError[]` non-null.
**Alternatives**: flat `| null` widening (rejected by the user — no narrowing, forces `!` noise that eventually lands on an unguarded site); interface + a separate narrowing type-guard function (extra indirection, opt-in, defeats the point).
**Rationale**: C3 proves the mechanical cost is nil. The compiler, not review, forces the fix.

### ADR-2 — Factories keep `''` / `200` / `400`; only the cast dies (D2)

**Choice**: `success()` stays `message: '', actionCode: 200`; `failure()` stays `message: '', actionCode: 400` and becomes `data: null` (the `null as unknown as T` cast at `envelope.ts:21` is deleted). Return annotations stay `BaseResponseModel<T>`; **no `as const`**.
**Alternatives**: emit `null` for `message`/`actionCode` ("honest, matches wire").
**Rationale**: rejected. `envelope.ts` is a byte-for-byte port of Angular `base.service.ts:204-226`, which hardcodes `""`/200/400 — and these are **local offline envelopes, not wire echoes**. Nullability describes what we may *read* off the wire, not what we must *write* locally. `''` and `200` already satisfy `string | null` / `number | null`, so honesty costs nothing here, and emitting `null` would be a gratuitous Angular divergence plus churn in `envelope.test.ts:8-27` and downstream fixtures, for zero benefit. `as const` is redundant given the annotation (C4); the rule that matters is **annotate every function that returns an envelope**.

### ADR-3 — Self-triggering union-collapse guard (D2)

**Choice**: a compile-time probe appended to `packages/domain/src/commons/__tests__/envelope.test.ts`:

```ts
// Union-collapse guard: if `succeeded` ever widens to `boolean` in either factory the
// discriminated union collapses and `data` silently stops narrowing. Both lines below
// then stop compiling — this fails `pnpm typecheck`, not vitest.
const _ok = success({ id: '1' });
if (_ok.succeeded) { const _narrowed: { id: string } = _ok.data; void _narrowed; }
const _bad = failure<{ id: string }>([]);
// @ts-expect-error — `data` is null on the failure branch; if this stops erroring, the union collapsed
const _collapsed: { id: string } = _bad.data;
void _collapsed;
```

**Alternatives**: vitest `expectTypeOf` (requires enabling vitest `typecheck` mode — new config surface + a second type-check pass); a custom ESLint rule (needs type-aware linting everywhere; expensive); "discipline" (the exact invisible failure mode being defended against).
**Rationale**: `@ts-expect-error` is *self-triggering* — collapse makes the directive unused, which is **TS2578**, a hard error. `packages/domain/tsconfig.json:20` includes `src/**/*` (tests included; `tsconfig.build.json:7` excludes them from the build), so `pnpm typecheck` enforces it with no new tooling. `ban-ts-comment` from `tseslint.configs.recommended` allows `@ts-expect-error` **with a description** — precedent at `sales/components/__tests__/category-stats.test.tsx:44`. `_`-prefixed bindings satisfy `no-unused-vars` per `packages/eslint-config/base.config.js:28-36`.

### ADR-4 — Per-file guard idioms, no shared helper (D3)

Each guard mirrors its own file's failure path — same setter, same key, same control shape. No helper, no unification, no `!`/`as`.

| Site | Idiom | Guard |
|---|---|---|
| `owner-list.tsx:20-21` | try/catch, `setError(string\|undefined)` | `if (!res.succeeded) { setError(intl.formatMessage({ id: 'OWNER.ERROR' })); return; }` before `setOwners(res.data)` |
| `reseller-list.tsx:19-20` | try/catch, destructured `formatMessage` | same shape, `RESELLERS.ERROR` |
| `store-list.tsx:28-29` | try/catch, destructured `formatMessage` | same shape, `STORES.ERROR` |
| `user-list.tsx:23-26` | `.then/.catch`, `useState('')` | inside `.then`: `if (!res.succeeded) { setError(intl.formatMessage({ id: 'USERS.ERROR' })); return; }` — `setError('')` on success (string state, **not** `undefined`) |
| `owner-edit.tsx:85-93` (C1) | try/catch, `setStoresError` | `if (!res.succeeded) { setStoresError(intl.formatMessage({ id: 'STORES.ERROR' })); return; }` |
| `owner-edit.tsx:141-144` | `.then/.catch`, `setLoadError('')` | inside `.then`: `if (!res.succeeded) { setLoadError(intl.formatMessage({ id: 'OWNER.ERROR' })); return; }` before `const o = res.data` |
| `owner-edit.tsx:162-165` | `.then`, `.catch` is `// non-critical` (silent) | `if (!res.succeeded) return;` — **no banner**, mirroring this call's own declared non-critical treatment |

Early-`return` (not `setX([])`) is deliberate: it leaves prior state intact, exactly as each file's existing `catch` already does.

## Data Flow

```
backend ResponseResult.Failure  ──wire──→  { succeeded:false, data:null, … }
                                              │
                            *-http-service.ts (pass-through, 0 changes)
                                              │
                                    ┌─────────┴─────────┐
                        succeeded:true            succeeded:false
                        data narrows to T         data is null
                        setX(res.data)            setError(<file's own key>); return
```

Local (offline) path is unchanged: `envelope.ts success()/failure()` → same fields, minus the cast.

## File Changes

All paths relative to `frontend-react/`.

| File | Action | Description |
|---|---|---|
| `packages/domain/src/models/base.ts` | Modify | `interface` → discriminated union (ADR-1) |
| `packages/domain/src/commons/envelope.ts` | Modify | delete `null as unknown as T` → `data: null` (ADR-2) |
| `packages/domain/src/commons/__tests__/envelope.test.ts` | Modify | add collapse probe (ADR-3); existing assertions unchanged |
| `app/admin/owners/routes/owner-list.tsx` + `__tests__/owner-list.test.tsx` | Modify | guard + failure test |
| `app/admin/resellers/routes/reseller-list.tsx` + test | Modify | guard + failure test |
| `app/admin/stores/routes/store-list.tsx` + test | Modify | guard + failure test |
| `app/management/users/routes/user-list.tsx` + `__tests__/user-routes.test.tsx` | Modify | guard + failure test |
| `app/admin/owners/routes/owner-edit.tsx` + test | Modify | **3** guards + failure tests |
| `app/shared/lib/auth/__tests__/user-home.test.ts:38` | Modify | annotate helper `: BaseResponseModel<boolean>` (C4) |
| `app/auth/routes/__tests__/register.test.tsx:85-92` | Modify | `data: null`, drop fabricated payload |
| **compiler-named remainder** | Modify | **unknown until WU0 runs** |

## Work-Unit Sequencing (D4 / D5)

**WU0 — enumeration spike, NOT a commit.** Flip `base.ts` to the union, run `pnpm typecheck` from `frontend-react/`, capture the full error list, then `git checkout -- packages/domain/src/models/base.ts`. Deliverable = the compiler output pasted into the tasks artifact. The 48-file figure is a **grep count of 298 occurrences**, not an error count; the true list is unknown until this runs. **The WU list below is expected to grow from WU0's output** — `sdd-tasks` sizes the final WU from it, and must not treat this document's file table as complete.

| WU | Contents | Divisible? |
|---|---|---|
| **A** | Guards + failure tests for `owner-list`, `reseller-list`, `store-list` (identical idiom) | Yes — could be 3 commits; grouped because the change is one shape |
| **B** | Guard + failure test for `user-list` (`.then` idiom, string error state) | Yes |
| **C** | 3 guards + tests for `owner-edit` (mixed idioms, incl. the silent one) | Yes |
| **D** | `base.ts` union + `envelope.ts` cast removal + ADR-3 probe + `user-home.test.ts` annotation + `register.test.tsx` fixture + every remaining file WU0 named | **NO — indivisible** |

WU-A/B/C are behaviour-only and compile under the current type, so each is independently committable and green. **WU-D is indivisible**: `base.ts` alone makes `envelope.ts:21` an error, and every fixture/annotation the union rejects becomes an error the instant `base.ts` changes. Splitting it per file leaves the tree red between commits, which the commits-only policy forbids. If WU0 shows WU-D exceeding ~400 lines it stays one commit anyway — a red tree is worse than a large diff. This is the same honesty call the previous change made for its WU1.

## Testing Strategy (strict TDD)

| WU | RED is a… | Because |
|---|---|---|
| A, B, C | **test** failure (`pnpm test`) | Behaviour: mock `succeeded: false` on the http-service, assert the error text renders and the list stays empty. Compiles today under the lying type — no type change required to write the RED. |
| D | **typecheck** failure (`pnpm typecheck`) | A type contract has no runtime observable. RED = the WU0 error set (incl. `register.test.tsx`, `user-home.test.ts`) plus the ADR-3 probe failing to compile before `base.ts` is fixed. Asserting this in vitest is impossible; the type-checker *is* the test. |

Gates for every WU, from `frontend-react/`: `pnpm typecheck`, `pnpm test`, `pnpm lint` (`--max-warnings=0`, 4 packages). Scoped runs (`pnpm -C apps/web-store-pos typecheck`) and the editor need `pnpm -C packages/domain build` first; root runs do not (C5).

## Migration / Rollout

No data migration. Revert order: WU-D → WU-C → WU-B → WU-A. WU-D is atomic — reverting `base.ts` alone re-breaks `envelope.ts`. Nothing is pushed; deleting `feat/response-envelope-nullability` is a full rollback.

## Open Questions

- [ ] None blocking. The only unknown is WU0's exact error set, which is resolved by running it — by design, not by asking.
