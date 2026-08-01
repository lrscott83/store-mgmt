# Tasks: register-endpoint-contract-frontend

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~90-130 (3 small WUs: 1 type + 1 retype + 5 mock flips; 2x tiny branch+i18n+test) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Not applicable — commits-only delivery |
| Delivery strategy | commits-only |
| Chain strategy | not applicable |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Delivery is commits-only on `feat/register-endpoint-contract-frontend` — no PRs, no chaining, no size exception. One commit per WU (3 commits total).

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | `RegisterAuthModel` domain type + `register()` retype + flip 5 mock sites | Indivisible — RED is `pnpm typecheck`, not `pnpm test` |
| 2 | Login 429 branch + `AUTH.TOO_MANY_ATTEMPTS` | Independent of WU1 payload shape |
| 3 | Register 429 branch + `REGISTRATION.TOO_MANY_ATTEMPTS` | Independent of WU2 |

## Phase 1: WU1 — Domain type + register() retype

Files: `frontend-react/packages/domain/src/models/auth.ts`, `frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts`, `.../http/__tests__/auth-http-service.test.ts`, `.../auth/routes/__tests__/register.test.tsx`

- [x] 1.1 Add `RegisterAuthModel` interface to `packages/domain/src/models/auth.ts` (after `AuthModel`): `{ login: string; authToken: string; expiresIn: string }`, JSDoc noting `authToken` is typed but deliberately unconsumed and `refreshToken` is intentionally absent (RegisterCommand.cs:132 never sets one). No `src/index.ts` edit needed (`export * from './models/auth'` already covers it).
- [x] 1.2 Run `pnpm -C frontend-react/packages/domain build` immediately (before any test run) so `dist/index.d.ts` picks up the new export.
- [x] 1.3 RED: in `auth-http-service.test.ts`'s `'returns the envelope typed as BaseResponseModel<boolean>'` test (line ~108-127), change the assertion to `const data: RegisterAuthModel = result.data;` and import `RegisterAuthModel` from `@store-mgmt/domain`. Confirm `pnpm typecheck` fails with TS2322 (assigning `boolean` to `RegisterAuthModel`). This is WU1's RED gate — `pnpm test` is not expected to fail here.
- [x] 1.4 GREEN: in `auth-http-service.ts`, change `register()` return type from `Promise<BaseResponseModel<boolean>>` to `Promise<BaseResponseModel<RegisterAuthModel>>` (both the method signature and the `apiClient.post<BaseResponseModel<...>>` generic), importing `RegisterAuthModel` from `@store-mgmt/domain`.
- [x] 1.5 GREEN: update `auth-http-service.test.ts` mock/assertion data to match the new shape — replace `data: true` with a `RegisterAuthModel`-shaped object (e.g. `{ login: 'janedoe', authToken: 'token', expiresIn: '2026-08-01T00:00:00Z' }`) at the `beforeEach` mock (line 14-16) and the typed-result test's mock (line 111-112); rename the test title away from "typed as BaseResponseModel<boolean>" to reflect `RegisterAuthModel`.
- [x] 1.6 GREEN: in `register.test.tsx`, flip all 5 `data: true` sites (lines 106, 137, 156, 328, 362) to a `RegisterAuthModel`-shaped object matching 1.5. Keep the `succeeded: true` / `navigate('/login')` assertion at line ~116 unchanged. DEVIATION: also flipped a 6th, previously unlisted site — the `data: false` literal in the `succeeded:false` test (~line 88) and the `resolveRegister` type annotation (~line 310) — both required for `RegisterAuthModel` (whose `data` field is non-optional) to typecheck; `BaseResponseModel<T>.data` is required even when `succeeded:false`.
- [x] 1.7 Gate (WU1): `pnpm -C frontend-react/packages/domain build` → `pnpm typecheck` → `pnpm test` → lint (`--max-warnings=0`) on the 4 lintable packages. Commit as one WU: "feat(auth): retype register() to RegisterAuthModel".

## Phase 2: WU2 — Login 429 feedback

Files: `frontend-react/apps/web-store-pos/app/auth/routes/login.tsx`, `.../auth/routes/__tests__/login.test.tsx`, `.../shared/lib/i18n/es.ts`

- [x] 2.1 RED: in `login.test.tsx`, add a test alongside the existing 401 case (~line 154) that does `vi.fn().mockRejectedValue({ status: 429 })` and asserts the new `AUTH.TOO_MANY_ATTEMPTS` copy renders. Confirm it fails (currently falls to the `else` branch → `AUTH.SERVER_ERROR` text).
- [x] 2.2 GREEN: add `'AUTH.TOO_MANY_ATTEMPTS': 'Demasiados intentos. Esperá un momento antes de volver a intentar.'` to `es.ts` (voseo namespace, near the other `AUTH.*` keys, lines 75-86).
- [x] 2.3 GREEN: in `login.tsx`, insert `else if (status === 429) { setErrors({ form: intl.formatMessage({ id: 'AUTH.TOO_MANY_ATTEMPTS' }) }); }` between the existing `status === 403` branch and the final `else` (lines 151-155).
- [x] 2.4 Gate (WU2): `pnpm test` → `pnpm typecheck` → lint. Re-run the 401/403 regression cases to confirm unchanged. Commit: "feat(auth): surface 429 rate-limit copy on login".

## Phase 3: WU3 — Register 429 feedback

Files: `frontend-react/apps/web-store-pos/app/auth/routes/register.tsx`, `.../auth/routes/__tests__/register.test.tsx`, `.../shared/lib/i18n/es.ts`

- [x] 3.1 RED: in `register.test.tsx`, add a test alongside the existing UNEXPECTED_ERROR case (~line 344) that does `vi.mocked(authHttpService.register).mockRejectedValue({ response: { status: 429 } })` and asserts the new `REGISTRATION.TOO_MANY_ATTEMPTS` copy renders. Confirm it fails (currently falls to `else` → `REGISTRATION.UNEXPECTED_ERROR` text).
- [x] 3.2 GREEN: add `'REGISTRATION.TOO_MANY_ATTEMPTS': 'Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.'` to `es.ts` (usted/tuteo namespace, near the other `REGISTRATION.*` keys, lines 102-125). Do NOT copy the voseo phrasing from `AUTH.TOO_MANY_ATTEMPTS`.
- [x] 3.3 GREEN: in `register.tsx`, change the `if (status === 400) {...} else {...}` at line ~128-138 into `if (status === 400) {...} else if (status === 429) { setErrors({ form: intl.formatMessage({ id: 'REGISTRATION.TOO_MANY_ATTEMPTS' }) }); } else {...}`. `finally` block (isLoading reset) stays untouched.
- [x] 3.4 Gate (WU3): `pnpm test` → `pnpm typecheck` → lint. Re-run the 400/email-taken/validation-error regression cases to confirm unchanged. Commit: "feat(auth): surface 429 rate-limit copy on register".

## Notes

- `api-client.ts` stays untouched across all 3 WUs — no new abstraction, no shared helper.
- No copy quotes a rate-limit number (5/min, 10/10min) — frontend does not read `Retry-After`.
- Lint gate: `--max-warnings=0` across the 4 lintable packages, run after typecheck in each WU's gate sequence.
- Rollback: each WU is an independent, `git revert`-able commit; reverting WU1 requires re-running the domain build.
