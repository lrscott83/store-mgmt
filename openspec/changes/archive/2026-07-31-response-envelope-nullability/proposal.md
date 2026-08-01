# Proposal: Response Envelope Nullability (Discriminated Union)

## Intent

`BaseResponseModel<T>` declares `data: T`, but the backend returns `data: null` on every reference-type failure (`ResponseResult.Failure<TData>` → `default`), and `message`/`actionCode` are `null` even on plain success (`Success<TData>` never sets them). The type lies. Consequences already in the repo: `envelope.ts` `failure<T>()` casts `data: null as unknown as T` to silence it, `register.test.tsx` fabricates a fake payload on a `succeeded: false` fixture, and five list-loaders call `setX(res.data)` with no `succeeded` check — a live latent bug the lying type hides.

**Decision (user, settled): a discriminated union on `succeeded`, not a flat `| null` widening.** A flat interface cannot narrow, so even correctly-guarded call-sites keep needing `!`; that `!` becomes noise that eventually lands on an unguarded site. The union makes the compiler force the fix instead of trusting review.

## Scope

### In Scope

- `packages/domain/src/models/base.ts` — union: `{succeeded: true; data: T}` | `{succeeded: false; data: null}`; `message: string | null`, `actionCode: number | null` on both branches; `errors: BaseError[]` stays non-null.
- `packages/domain/src/commons/envelope.ts` — delete the `null as unknown as T` cast; `success`/`failure` become the literal-typed chokepoint (`succeeded: true as const`) that keeps the union from collapsing to `boolean`.
- Real `succeeded` guards at the 5 unguarded loaders: `owner-list.tsx:20-21`, `reseller-list.tsx:19-20`, `store-list.tsx:28-29`, `user-list.tsx:23-26`, `owner-edit.tsx:141-144,162-165`. Each mirrors the file's own existing failure idiom (e.g. `setError(intl.formatMessage({ id: 'OWNER.ERROR' }))`). No `!`, no cast, no new error pattern.
- Every fixture/mock the union breaks, including `register.test.tsx:85-92` → `data: null`.

### Out of Scope

- Backend changes of any kind (read-only source of truth, even though C# emits CS8603 on the same lie).
- Angular. Its twin lies identically only because its tsconfig lacks `strictNullChecks`; per project rule this is a **defect**, not a contract to replicate. No fork remains.
- `DataResult<T>` (`result.ts`) and any refactor not forced by the type change.

## Capabilities

### New Capabilities

- `response-envelope`: the `BaseResponseModel<T>` wire contract — discriminated union on `succeeded`, nullability per field, and the `success()`/`failure()` factory chokepoint.

### Modified Capabilities

- `admin-owners-resellers`: owner/reseller list + owner-edit loaders MUST surface the error state on `succeeded: false` instead of setting `null` data.
- `admin-stores`: same for the store list loader.
- `management-users`: same for the user list loader.

## Approach

1. **Enumerate the real breakage FIRST.** Change `base.ts`, run `pnpm typecheck`, and treat the compiler output as the authoritative call-site list. The exploration sampled 48 files rather than compiling; the true count is unknown until `tsc --noEmit` runs.
2. Update `envelope.ts` factories with `as const` tags so the union survives inference.
3. Fix each compile error by category: pass-through http-services (no change expected), already-guarded consumers (narrowing becomes free), unguarded loaders (real guard, TDD), typed mocks (`data: null`).
4. Strict TDD per fixed loader: failing test asserting the error path first, then the guard.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/models/base.ts` | Modified | Interface → discriminated union |
| `packages/domain/src/commons/envelope.ts` | Modified | Drop unsafe cast; literal-typed tags |
| `app/admin/owners/routes/{owner-list,owner-edit}.tsx` | Modified | Real `succeeded` guards |
| `app/admin/resellers/routes/reseller-list.tsx` | Modified | Real `succeeded` guard |
| `app/admin/stores/routes/store-list.tsx` | Modified | Real `succeeded` guard |
| `app/management/users/routes/user-list.tsx` | Modified | Real `succeeded` guard |
| Test fixtures (incl. `register.test.tsx`) | Modified | `data: null` on failure fixtures |
| Unknown remainder of 48 `BaseResponseModel` refs | TBD | Enumerated by typecheck, not by this proposal |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| True blast radius larger than sampled — exploration did NOT run an exhaustive compile audit | **High** | Step 1 is `pnpm typecheck` before any fix planning; `sdd-tasks` sizes from compiler output, not from this doc |
| Union collapses silently if any literal envelope infers `succeeded: boolean` | Med | Route construction through `success()`/`failure()`; `as const` on inline literals |
| A dev "fixes" a compile error with `!` or a cast, re-hiding the bug | Med | Explicit rule: no `!`/cast at the 5 loaders; verify phase greps the diff for `!`/`as` on envelope reads |
| `BaseResponseModel<boolean>`/`<number>` gain a `data: null` branch they never hit at runtime | Low | Harmless imprecision; call-sites already null-safe (`products.tsx:82-83`) |
| Guard behavior invents UX not present in the file | Med | Each guard mirrors the file's existing failure idiom; no new patterns |

## Rollback Plan

Single-concern commits on `feat/response-envelope-nullability` (stacked on archived `register-endpoint-contract-frontend`, HEAD `975b677`, tree clean). Revert order: loader guards → envelope factories → `base.ts`. Reverting `base.ts` alone restores the old lie and re-breaks the factory cast, so revert the whole set or nothing. Nothing is pushed; branch deletion is a full rollback.

## Dependencies

- None external. Backend is read-only and already consistent (nulls serialize — no `DefaultIgnoreCondition` configured anywhere).

## Delivery Config

- Branch `feat/response-envelope-nullability`; **commits-only**, work-unit commits. No PRs, no chained PRs, no size exception, no push.
- `strict_tdd: true` — `pnpm test`, `pnpm typecheck`, lint `--max-warnings=0` (4 packages), all from `frontend-react/`.
- `artifact_store: hybrid` — this file + engram `sdd/response-envelope-nullability/proposal`.

## Success Criteria

- [ ] `BaseResponseModel<T>` is a discriminated union; `data` is `T` only on the `succeeded: true` branch.
- [ ] `null as unknown as T` no longer exists anywhere in `packages/domain`.
- [ ] `if (res.succeeded)` narrows `res.data` to `T` with no `!` or cast at any call-site.
- [ ] All 5 loaders handle `succeeded: false` with their file's existing error idiom, each covered by a test written before the fix.
- [ ] No failure-path fixture fabricates a fake `data` payload.
- [ ] `pnpm typecheck`, `pnpm test`, and lint `--max-warnings=0` pass across all 4 packages.
