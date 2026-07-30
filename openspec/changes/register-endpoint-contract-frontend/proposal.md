# Proposal: register-endpoint-contract-frontend

**Date**: 2026-07-30 · **Branch**: `feat/register-endpoint-contract-frontend` · **Delivery**: commits-only
**strict_tdd**: true — `pnpm test`, `pnpm typecheck`, lint `--max-warnings=0` (4 packages)
**Artifact store**: hybrid

## Intent

The backend `register-endpoint-fixes` change shipped. Two frontend consequences:

1. `POST /v1/auth/register` now returns `ResponseResult<AuthDto>`, but
   `auth-http-service.ts:18` still declares `Promise<BaseResponseModel<boolean>>`. The type is
   simply **false**. Nothing crashes today only because `register.tsx:119` reads `response.succeeded`
   and never touches `data` — so the lie is inert until someone believes it.
2. `login` and `register` are now rate-limited (5/min and 10/10min, `Program.cs:113-140`) and
   the frontend handles 429 **nowhere**. A rate-limited user gets `AUTH.SERVER_ERROR`
   ("Algo salió mal. Intentá de nuevo.") or `REGISTRATION.UNEXPECTED_ERROR` — copy that tells
   them to retry, which is the one thing that makes it worse.

**What this is worth, honestly**: item 1 is preventive type hygiene with zero user-visible effect
today. Item 2 is the only behavioural win, and it is small — two strings and two branches. This is
a correctness/debt change, not a feature. Do not oversell it and do not grow it.

## Settled Decisions

| # | Decision | Reasoning |
|---|---|---|
| 1 | **No auto-authentication after register.** Keeps `navigate('/login')`. | Angular `frontend/src/app/presentation/auth/register/register.component.ts:75` does `this.router.navigateByUrl('/login')` (verified; its `loadInitData()` is commented out). Standing project rule is parity with Angular, not improvement. The returned `authToken` will be **received and typed but deliberately NOT consumed** — this is a choice, not an oversight. |
| 2 | **Two distinct 429 i18n keys**, not one shared. | `AUTH.*` and `REGISTRATION.*` are already separate flat namespaces (`es.ts:80-83`, `114-120`) and each page already draws error copy from its own. Windows differ materially (1 min vs 10 min), so each key can state an accurate wait. |
| 3 | **Per-page local 429 branch** (exploration Approach 1); do NOT centralize in `api-client.ts`. | 401/403/400 are already handled per-page. `api-client.ts` is shared by 13 http-service files and has exactly one status branch (500). Touching it for a 2-endpoint problem is blast radius without payoff. |

## Scope

### In Scope

- New register-response type in `packages/domain/src/models/auth.ts`, matching the real `AuthDto`:
  `{ login: string; authToken: string; expiresIn: string }` (ISO-8601 wire string), `refreshToken`
  absent/optional. **Must not reuse `AuthModel`** — its `refreshToken: string` is required and its
  `expiresIn` is a `number`; `RegisterCommand.cs:132` never sets a refresh token.
- Retype `register()` at `auth-http-service.ts:18` to `BaseResponseModel<<new type>>`.
- `status === 429` branch in `login.tsx`'s catch (~line 148) → new `AUTH.*` key.
- `status === 429` branch in `register.tsx`'s catch (~line 128) → new `REGISTRATION.*` key.
- Both keys added to `app/shared/lib/i18n/es.ts` (single locale file; no `en.ts` exists).
- Update the affected tests: `auth-http-service.test.ts` (`typeof result.data === 'boolean'`,
  line 126, plus every `data: true` mock), `register.test.tsx` (`data: true` mocks; the
  `navigate('/login')` assertion at line 103 **stays**), `login.test.tsx` (429 test mirroring the
  bare `{ status: 401 }` shape at line 155).

### Out of Scope

| Item | Reason |
|---|---|
| Auto-auth after register | Decision 1 — Angular parity. |
| Centralizing 429 in `api-client.ts` | Decision 3 — blast radius across 13 consumers. |
| Unifying `err.status` (login) vs `err.response?.status` (register) | Real debt, both files are open — but see recommendation below. Not required by the contract change. |
| "Handle 201 Created" (impact doc, item 2) | **No-op — verified.** `api-client.ts` sets no custom `validateStatus`, so axios' default (2xx resolves) already accepts 201, and `register.tsx:119` branches only on the body's `succeeded`, never on HTTP status. There is no code that would need to change. Stating this so nobody invents work for it. |
| `formatVersion` / roster / at-rest encryption | Tracked in `docs/plans/2026-07-25-at-rest-encryption-frontend-plan.md`. |
| Backend's `_ => BadRequest` collapse of register failures | Backend quirk; do not branch beyond 400/429. |

### Recommendation on the error-shape divergence (tasks decides)

**Do not unify.** `register.tsx` must read `.response.data.message` for its 400/EMAIL_TAKEN branch,
so it destructures `.response` regardless; forcing it onto the `.status` getter yields two reads of
the same error. Conversely, unifying on `.response?.status` breaks `login.test.tsx`'s bare
`{ status: 401 }` mocks for no behavioural gain. Both patterns are correct against a real
`AxiosError` (`auth-store.ts:185` rethrows it raw, so `.status` reaches `login.tsx` intact). The
divergence is cosmetic; unifying it costs test churn and buys nothing.

## Capabilities

### New Capabilities
- `auth-rate-limit-feedback`: how `login.tsx` and `register.tsx` surface HTTP 429 to the user, and
  the i18n keys that back it. No existing frontend capability covers page-level auth error
  surfacing (`auth-session` is `useAuthStore` lifecycle; `rate-limiting` is the **backend** policy
  spec and must not be edited by a frontend change).

### Modified Capabilities
- `auth-http`: `openspec/specs/auth-http/spec.md:20` literally encodes
  `return type Promise<BaseResponseModel<boolean>>` — it becomes wrong with this change. Line 21's
  "navigate to `/login` on success" is **reaffirmed unchanged** (decision 1).

## Approach

Three thin TDD slices, each red→green, each its own commit:

1. **Domain type + service retype** — add the register-response type, flip
   `auth-http-service.ts:18`, fix `auth-http-service.test.ts`. Run
   `pnpm -C packages/domain build` before typecheck (see Constraints).
2. **Login 429** — failing `login.test.tsx` case rejecting with `{ status: 429 }`, then the branch
   plus the `AUTH.*` key.
3. **Register 429** — failing `register.test.tsx` case rejecting with
   `{ response: { status: 429 } }`, then the branch plus the `REGISTRATION.*` key.

Slice 1 also flips `register.test.tsx`'s `data: true` mocks to the object shape while keeping its
`navigate('/login')` assertion green — proof that the contract moved and the flow did not.

### Alternatives considered and rejected

| Alternative | Why it lost |
|---|---|
| Centralize 429 in `api-client.ts` via an `isRateLimited` tag (mirroring the `isNetworkError` tag at lines 79-82) | Genuinely the tidier idiom and would have cleaned up the duplication for free — but it edits an interceptor shared by 13 http-services to solve a problem scoped to 2 endpoints. Revisit if a third rate-limited endpoint appears. |
| Reuse `AuthModel` for the register response | Wrong shape: required `refreshToken`, numeric `expiresIn`. Would need a lie or a cast. |
| Auto-authenticate using the new `authToken` | Diverges from Angular; changes a well-tested flow for UX the contract fix does not require. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `packages/domain/src/models/auth.ts` | New | Register-response type |
| `apps/web-store-pos/app/shared/lib/http/auth-http-service.ts:18` | Modified | Return type |
| `apps/web-store-pos/app/auth/routes/login.tsx` | Modified | 429 branch |
| `apps/web-store-pos/app/auth/routes/register.tsx` | Modified | 429 branch |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modified | 2 keys |
| `__tests__/{auth-http-service,login,register}` | Modified | See In Scope |
| `openspec/specs/auth-http/spec.md` | Modified | Delta spec |
| `api-client.ts` | **Untouched** | Decision 3 |

## Constraints

- **`pnpm -C packages/domain build` is a task-level obligation, not a footnote.** `web-store-pos`
  imports `@store-mgmt/domain` from `dist/`, so a domain type change without the rebuild does not
  surface in `pnpm typecheck` at all — the slice would go green while the contract is still broken.
- Lint gate is real: any warning fails the build.
- Every slice starts with a failing test.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Domain `dist/` not rebuilt → false-green typecheck | **High** (easy to forget) | Explicit task step in slice 1, before typecheck |
| 429 branch written but unreachable (wrong error shape read) | Low | Verified: `auth-store.ts:185` rethrows the raw `AxiosError`, whose `.status` getter (axios ^1.7.9) is populated; `register.tsx` reads `.response.status` off the same object |
| i18n copy quotes a retry window that drifts if backend policy changes | Medium | Word the copy so it stays true if the window moves; the exact minutes live in `Program.cs`, not here |
| Typed-but-unused `authToken` reads as dead code in review | Medium | Documented as deliberate (decision 1); a comment at the type declaration |

**Residual risk, not minimized**: this change makes the *type* honest and the *copy* honest. It does
not make the register flow better — a newly registered user still retypes credentials they typed
seconds ago, holding a valid token the app throws away. That is a real product wart, consciously
preserved for Angular parity. If parity is ever relaxed, this is the first thing to revisit.

## Rollback Plan

Three independent commits on `feat/register-endpoint-contract-frontend`. Revert any slice with
`git revert <sha>` — slices 2 and 3 are additive branches with no shared state; slice 1 reverts to
`BaseResponseModel<boolean>` (still runtime-inert). If only the domain type is reverted, re-run
`pnpm -C packages/domain build`.

## Dependencies

- Backend `register-endpoint-fixes` is deployed (done; read-only source of truth here).

## Success Criteria

- [ ] `register()` returns `BaseResponseModel<<register-response type>>`; no `boolean` remains at
      `auth-http-service.ts:18`.
- [ ] The new type has `expiresIn: string` and no required `refreshToken`; `AuthModel` is unchanged.
- [ ] `pnpm -C packages/domain build` run, then `pnpm typecheck` passes workspace-wide.
- [ ] `auth-http-service.test.ts` no longer asserts `typeof result.data === 'boolean'`; it asserts
      the `{ login, authToken, expiresIn }` shape.
- [ ] `register.test.tsx` still asserts `navigate('/login')` on success, with an object `data`.
- [ ] A `{ status: 429 }` login rejection renders the new `AUTH.*` copy (test).
- [ ] A `{ response: { status: 429 } }` register rejection renders the new `REGISTRATION.*` copy (test).
- [ ] Both keys exist in `es.ts` as flat `AUTH.*` / `REGISTRATION.*` siblings.
- [ ] `git diff` touches zero lines of `api-client.ts`.
- [ ] `pnpm test` green; lint clean at `--max-warnings=0`.

## Notes on the Exploration

Every claim I re-checked held: `register.tsx:119-141`, `auth-http-service.ts:18`,
`api-client.ts` (one 500 branch, `isNetworkError` tag, no `validateStatus`), `auth.ts` `AuthModel`,
`login.tsx:148-155`, `es.ts:80-83`, Angular `register.component.ts:75`. Two additions of my own:
(a) `auth-store.ts:185` rethrows the raw error, which is what makes login's `.status` read valid
for 429; (b) the 201 question resolves to a verified no-op rather than an open item.
