# Verification Report: register-endpoint-contract-frontend

**Mode**: hybrid (engram + openspec files)
**Verified against**: HEAD `00b4333`, base `ff3d731`, branch `feat/register-endpoint-contract-frontend`
**Verdict**: **PASS WITH WARNINGS**

## Completeness (tasks.md)

15/15 checkboxes marked `[x]`; all correspond to real diffs (`git diff --stat ff3d731..HEAD`, 9 files, +114/-29). No orphan checkbox, no unchecked-but-implemented work found.

| WU | Task range | Status |
|----|-----------|--------|
| 1 | 1.1–1.7 | Done — commit `7d6e3ee` |
| 2 | 2.1–2.4 | Done — commit `d7b06d8` |
| 3 | 3.1–3.4 | Done — commit `00b4333` |

## Gates — independently re-run (not taken on faith)

- `pnpm typecheck` (turbo, 5 packages): **PASS** — `@store-mgmt/domain`, `@store-mgmt/web-common`, `@store-mgmt/web-store-pos` all cache-hit green, full turbo.
- `pnpm test -- --run`: **PASS** — 155 test files / 2164 tests, 0 failures.
- `pnpm lint -- --max-warnings=0`: **PASS** — 4/4 lintable packages, 0 warnings.
- `api-client.ts` diff (`git diff ff3d731..HEAD -- '*api-client.ts'`): **empty**, confirmed.

## Spec compliance matrix

### auth-http (delta S2/S3)

| Requirement/Scenario | Evidence | Status |
|---|---|---|
| S2: `register()` resolves `Promise<BaseResponseModel<RegisterAuthModel>>`, not boolean/AuthModel | `auth-http-service.ts:24,37` | PASS |
| S2 shape: `login/authToken/expiresIn:string`, no `refreshToken` | `packages/domain/src/models/auth.ts:24-29` | PASS |
| S2: type is NOT an alias/extension of `AuthModel` | `auth.ts:24-29` — separate `interface`, no `extends` | PASS |
| S2 constraint: envelope returned verbatim, no flattening | `auth-http-service.ts:41` `return response.data;` unchanged shape | PASS |
| S2 scenario covered by runtime test | `auth-http-service.test.ts:115-141` (`result.data: RegisterAuthModel`) — ran green | PASS |
| S3: `succeeded===true` → `navigate('/login')`, unconditional | `register.tsx:119-120` | PASS |
| S3: `data.authToken` typed but never read/persisted on success path | `register.tsx` has zero `authToken` references anywhere in the file (grep confirmed) | PASS |
| S3: `succeeded===false` → `setErrors({form: errors[0].description})`, no navigation | `register.tsx:121-122` | PASS |
| S3: transport errors caught in separate outer `catch` | `register.tsx:124-140` (outer catch handles 400/429/else, envelope branch is inside `try`) | PASS |
| S3 scenarios covered by runtime tests | `register.test.tsx` success/failure tests (existing, still green in 2164) | PASS |

### auth-rate-limit-feedback (new capability)

| Requirement/Scenario | Evidence | Status |
|---|---|---|
| Req 1: login 429 → new `AUTH.*` key, distinct from SERVER_ERROR/INVALID_CREDENTIALS | `login.tsx:153-154` `else if (status === 429)`; `es.ts:83` `AUTH.TOO_MANY_ATTEMPTS` | PASS |
| Req 1 scenario covered by runtime test | `login.test.tsx:174-187` (`mockRejectedValue({status:429})`, asserts new copy) — ran green | PASS |
| Req 2: register 429 → new `REGISTRATION.*` key, distinct from UNEXPECTED_ERROR | `register.tsx:136-137` `else if (status === 429)`; `es.ts:122-123` `REGISTRATION.TOO_MANY_ATTEMPTS` | PASS |
| Req 2 scenario covered by runtime test | `register.test.tsx:350-` (`mockRejectedValue({response:{status:429}})`) — ran green | PASS |
| Req 3 regression: login 401→INVALID_CREDENTIALS, 403→ACCOUNT_INACTIVE | `login.tsx:149-152` unchanged branches, still passing in full suite | PASS |
| Req 3 regression: register 400+email→EMAIL_TAKEN, 400 no-email→VALIDATION_ERROR | `register.tsx:128-135` unchanged branches, still passing in full suite | PASS |

## Design coherence

| Design decision | Check | Status |
|---|---|---|
| D1 type name `RegisterAuthModel`, package `packages/domain/src/models/auth.ts` | `auth.ts:24` | MATCH |
| D1 `refreshToken` omitted (not optional) | `auth.ts:24-29` — field absent entirely | MATCH |
| D2 copy exact strings, no rate-limit numbers | `es.ts:83,122-123` — text byte-identical to design.md; no "5", "10", "min" figures | MATCH |
| D2 voice split: `AUTH.*` voseo, `REGISTRATION.*` usted/tuteo + "Por favor," prefix | `AUTH.TOO_MANY_ATTEMPTS`: "Esperá" (voseo). `REGISTRATION.TOO_MANY_ATTEMPTS`: "Por favor, espere" (usted) | MATCH |
| D3 login.tsx: `else if (429)` between 403 branch and final `else`, after untouched `loginRejectionDescription` early return | `login.tsx:136-146` (early return unchanged) then `148-157` (401/403/429/else chain) | MATCH |
| D3 register.tsx: `else if (429)` after the 400 block, `finally` untouched | `register.tsx:128-143` | MATCH |
| No new abstraction / shared helper | Confirmed — each file's branch is inline, no extracted function | MATCH |
| `api-client.ts` untouched | `git diff` empty | MATCH |
| No `_authToken` binding created | Confirmed via grep — `register.tsx` never destructures `response.data` | MATCH |

## Deviation review (Task 1.6 documented deviation)

Apply-progress documents a 6th flipped site beyond the 5 named in tasks.md 1.6: the `data: false` literal (`register.test.tsx:88`, the `succeeded:false` test) and the `resolveRegister` local type annotation (`register.test.tsx:308-310`).

- **Necessity**: confirmed. `BaseResponseModel<T>.data` is `T` (non-optional) at `packages/domain/src/models/base.ts:14`. Once `RegisterAuthModel` replaced `boolean`, any site providing `data: false` — even for a `succeeded:false` fixture — became a type error (`false` is not assignable to `RegisterAuthModel`). The fix was mechanical and unavoidable to keep `pnpm typecheck` green.
- **Scope**: correctly in-scope. It's a same-shape consequence of the WU1 retype, not a new behavioral change — no test assertions changed, only the literal's shape.
- **Is `BaseResponseModel.data` being non-nullable on the failure path a real contract gap?** Yes, arguably: a `succeeded: false` response conceptually shouldn't need a populated `data` payload, and forcing callers to synthesize one (as this fixture now does) is a modeling smell inherited from `BaseResponseModel<T>` itself (`data: T`, not `data: T | null`). This is a **pre-existing** issue in the shared `BaseResponseModel` contract, not something this change introduced or is scoped to fix — correctly left out of scope here. Recommended as separate follow-up work (see Suggestions below), not a blocker.

## Findings

### CRITICAL
None.

### WARNING

1. **Spec/design/code naming drift on the new type is undocumented in the spec artifact.** `openspec/changes/register-endpoint-contract-frontend/specs/auth-http/spec.md:8,15` (and the matching engram spec observation) name the type `RegisterAuthResponse` in both the normative requirement sentence and the `Shape` code sample. `design.md` (D1) explicitly rejected `RegisterResponse` as inventing a `*Response` suffix that doesn't exist in the package, and chose `RegisterAuthModel` instead — but that correction was never back-ported into `spec.md`'s literal text. The implementation correctly follows the design decision (`RegisterAuthModel` throughout). Functionally this is a non-issue (spec's normative *shape*/*distinctness* requirements are fully met), but the spec.md artifact itself is now factually wrong about the identifier name and will confuse future readers who go straight from spec to code. **Action for archive**: update `specs/auth-http/spec.md`'s S2 requirement text and code sample from `RegisterAuthResponse` to `RegisterAuthModel` before merging into the canonical `openspec/specs/auth-http/spec.md`, so the archived spec matches shipped code.

### SUGGESTION

1. **`BaseResponseModel<T>.data` is non-nullable even on `succeeded: false` responses** (`packages/domain/src/models/base.ts:14`). This forced a synthetic `data` payload into a failure-path test fixture (`register.test.tsx:88`) that has no real data to report. Worth a follow-up change (out of this change's scope) to consider `data: T | null` or a discriminated union (`{succeeded:true,data:T} | {succeeded:false,data:null}`) shared across all `BaseResponseModel` consumers — but that's a domain-wide contract change touching every caller, correctly deferred.

## Final Verdict

**PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING (documentation drift only, not a functional or behavioral gap), 1 SUGGESTION (pre-existing, out-of-scope follow-up). All spec requirements/scenarios have passing covering tests. All design decisions honored in the shipped code. All 15 tasks genuinely complete. Safe to proceed to archive; the WARNING should be resolved as part of archive's spec-merge step (correct the type name in the delta spec file before it's folded into the canonical `openspec/specs/auth-http/spec.md`).
