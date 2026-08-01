# Design: register-endpoint-contract-frontend

## Technical Approach

Three TDD work units, each one commit on `feat/register-endpoint-contract-frontend`: (1) domain type +
`register()` retype, (2) login 429, (3) register 429. No new abstraction, no shared helper, no
`api-client.ts` edit. Every decision below was re-verified against source; four proposal claims did not
survive and are corrected in **Corrections**.

## Architecture Decisions

### D1 — Type name and shape

**Choice**: `RegisterAuthModel` in `packages/domain/src/models/auth.ts`:

```ts
/**
 * Register's `AuthDto`. `authToken` is returned and typed but deliberately NOT
 * consumed — register navigates to /login (Angular parity, proposal decision 1).
 * `refreshToken` is absent by design: RegisterCommand.cs:132 never sets one.
 */
export interface RegisterAuthModel {
  login: string;
  authToken: string;
  expiresIn: string; // ISO-8601 (backend DateTime), NOT epoch ms like AuthModel
}
```

| Option | Tradeoff | Verdict |
|---|---|---|
| `RegisterResponse` | Introduces a `*Response` suffix that exists nowhere in the package | Rejected — invents vocabulary |
| `RegisterModel` | Reads as "a registration", not "the auth payload from register" | Rejected |
| `RegisterAuthModel` | Pairs with `RegisterRequest`, sits beside `AuthModel`, uses the package's only two suffixes (`*Model` payload / `*Request` body) | **Chosen** |

**`refreshToken` omitted entirely, not optional.** Optional invites `if (data.refreshToken)` guards for a
field the backend never populates. Omission also keeps `RegisterAuthModel` structurally *non*-assignable
to `AuthModel` in both directions (`expiresIn` string vs number), so nobody can accidentally feed a
register response into the auth-store login seam.

**Export**: none needed. `src/index.ts:2` is `export * from './models/auth'`; `tsconfig.build.json`
excludes only tests, so the interface reaches `dist/index.d.ts` on build.

### D2 — i18n keys and copy

```ts
'AUTH.TOO_MANY_ATTEMPTS': 'Demasiados intentos. Esperá un momento antes de volver a intentar.',
'REGISTRATION.TOO_MANY_ATTEMPTS':
  'Demasiados intentos de registro. Por favor, espere unos minutos antes de volver a intentar.',
```

No copy quotes a number. The 5/min and 10/10min windows live in `Program.cs`; the frontend does not read
`Retry-After`, so any figure printed here is a guess asserted as fact that silently rots when the policy
moves. "un momento" / "unos minutos" stay true under any plausible window.

**Register (voice) — this is where the brief was wrong.** `AUTH.*` is voseo (`es.ts:81-84`: "Intentá",
"Contactá", "Estás offline"). `REGISTRATION.*` is **not**: it is usted/tuteo with a "Por favor," prefix
(`es.ts:105`, `114-115`, `120`, `124-125`: "revise su conexión", "revise sus datos", "Usted debe
aceptar"), mirrored from Angular `vocabs/es.ts`. Each new key matches **its own namespace**, not a single
house style. Copying voseo into `REGISTRATION.*` would break the file's internal consistency.

### D3 — Branch placement, and proof each is reachable

`api-client.ts:88-98`: 429 has a `response` and is not 500, so the interceptor rejects the **raw
`AxiosError`**.

- **`login.tsx`** — `auth-store.ts:183-186` catches and `throw err` unchanged. Installed axios is
  **1.16.1**, and `AxiosError.js:122-125` assigns `this.status = response.status` whenever a response
  exists. `err.status === 429` is real. Insert `else if (status === 429)` between the 403 and the `else`
  (line 151-155), after the untouched `loginRejectionDescription` early return (a 429 carries no such
  tag). Reachable only on the unprovisioned path — a provisioned roster returns at line 108 and never
  hits the network. Correct: offline auth is not rate-limited.
- **`register.tsx`** — calls `authHttpService.register` directly, reads `.response?.status` off the same
  object (line 126). Convert `if (400) {…} else {…}` into `if (400) {…} else if (429) {…} else {…}` at
  line 136. `finally` already resets `isLoading`.

Patterns stay divergent (proposal recommendation): `register.tsx` needs `.response.data.message` anyway,
and unifying login onto `.response?.status` breaks its bare `{ status: 401 }` mocks for zero behaviour.

### D4 — `pnpm -C packages/domain build`

Run it in WU1 **immediately after editing `models/auth.ts`, before the red test**. Without it,
`dist/index.d.ts` has no `RegisterAuthModel`, and the editor/tsserver plus any scoped
`pnpm -C apps/web-store-pos typecheck` resolve `@store-mgmt/domain` through `package.json` exports →
stale `dist/`, reporting a phantom missing export.

## File Changes

| File | Action | WU |
|---|---|---|
| `packages/domain/src/models/auth.ts` | Add `RegisterAuthModel` | 1 |
| `apps/web-store-pos/app/shared/lib/http/auth-http-service.ts:18,31` | `boolean` → `RegisterAuthModel` | 1 |
| `…/http/__tests__/auth-http-service.test.ts:15,108,112,126` | Red type assertion + shape | 1 |
| `…/auth/routes/__tests__/register.test.tsx:106,137,156,328,362` | `data: true` → object (**5** sites) | 1 |
| `…/auth/routes/login.tsx:151-155` | 429 branch | 2 |
| `…/auth/routes/__tests__/login.test.tsx` | 429 case, shape of line 155 | 2 |
| `…/auth/routes/register.tsx:136` | 429 branch | 3 |
| `…/auth/routes/__tests__/register.test.tsx` | 429 case | 3 |
| `…/shared/lib/i18n/es.ts` | `AUTH.TOO_MANY_ATTEMPTS` (WU2), `REGISTRATION.TOO_MANY_ATTEMPTS` (WU3) | 2,3 |
| `api-client.ts` | **Untouched** | — |

## Testing Strategy — WU boundaries under strict TDD

| WU | RED (first) | GREEN | Commit gate |
|---|---|---|---|
| 1 | `const data: RegisterAuthModel = result.data;` in `auth-http-service.test.ts` → **`pnpm typecheck` fails TS2322** | Retype `auth-http-service.ts`; flip all `data: true` mocks; `register.test.tsx:116` `navigate('/login')` assertion **stays** | domain build → typecheck → test → lint |
| 2 | `login.test.tsx`: `mockRejectedValue({ status: 429 })`, assert the AUTH copy → fails (renders `AUTH.SERVER_ERROR`) | es.ts key + branch | test → typecheck → lint |
| 3 | `register.test.tsx`: `mockRejectedValue({ response: { status: 429 } })` → fails (`REGISTRATION.UNEXPECTED_ERROR`) | es.ts key + branch | test → typecheck → lint |

**WU1's red is the typecheck gate, not `pnpm test`.** A pure retype cannot fail a runtime assertion —
if the mock already returns the object, the passthrough assertion is green before the production change.
Pretending otherwise would be theatre. WU1 is also indivisible: splitting the domain type from the
retype leaves typecheck red between commits. `tsconfig.json:2` includes `**/*`, so tests are in
typecheck scope and the red line is a real gate.

## Corrections to the proposal

1. **`pnpm typecheck` risk is MEDIUM, not HIGH.** `turbo.json:13-16` declares
   `typecheck.dependsOn: ["^build", "^typecheck"]`, so root `pnpm typecheck` *does* build domain first —
   the "false-green typecheck" scenario cannot happen there. It can happen in a scoped package
   typecheck, in the editor, and in `pnpm test` (turbo `test` has **no** `^build`). Keep the step; it is
   cheap insurance for the paths turbo does not cover, not a load-bearing save.
2. **REGISTRATION.\* is not voseo** — see D2. The brief's "informal address" premise holds for `AUTH.*` only.
3. **`AxiosError.status` is an assigned property, not a getter**, and the installed version is **1.16.1**
   (proposal said "^1.7.9 getter"). Conclusion unchanged: reachable.
4. **The unused-`authToken` lint risk is void.** No binding is created — `register.tsx` never
   destructures `response.data`. `@typescript-eslint/no-unused-vars` does not apply to interface members.
   The `^_` convention exists (`packages/eslint-config/base.config.js:31-34`) but is not needed here; if
   apply reaches for `_authToken`, it has invented a binding it should delete instead.
5. **`register.test.tsx` has 5 `data: true` sites** (106, 137, 156, 328, 362), not the two named.

## Migration / Rollout

No migration. Three independent `git revert`-able commits; re-run the domain build if WU1 is reverted.

## Open Questions

None blocking.
