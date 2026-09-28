# auth-http Capability Specification

**Capability**: auth-http registration contract  
**Origin**: SDD change `auth-http-register-parity` (Slice 2, Fase 1 — auth cluster)  
**Status**: Active  
**Last Updated**: 2026-07-31

---

## Purpose

Define the HTTP contract for user registration in the auth-http service layer. This specification ensures that the React registration flow mirrors the Angular `registerOwner` contract exactly: request payload shape, response envelope type, and form-to-service data flow.

---

## Capability Scope

### In Scope
- **RegisterRequest model shape**: Required fields (`fullName`, `login`, `password`, `cellPhone`, `email`, `storeName`) and optional `code` field; explicit exclusion of `passwordConfirmation` from the wire payload.
- **register() service contract**: POST to `/v1/auth/register` with conditional code inclusion; return type `Promise<BaseResponseModel<RegisterAuthModel>>`.
- **Envelope handling**: Response branching on `succeeded` field; surface `errors[0].description` on failure; navigate to `/login` on success.
- **Form integration**: Register form supplies `login` and `storeName` required inputs; reads `?code` query parameter; client-only validation of `passwordConfirmation` match.

- **getMe() billing fields passthrough** (added by `store-paid-plan-billing-frontend`, archived
  2026-07-27): `UserModel` billing fields (`paymentDueDate`, `isInTrial`, `paymentStatus`) MUST
  flow through `getMe()` unchanged, with zero mapping/defaulting added to the transport layer.

### Out of Scope (deferred to subsequent slices)
- Accept/terms toggle and `/terminos-condiciones` route (product decision-gate a).
- Email validation relaxation (product decision-gate b).
- cellPhone input masking (decision-gate c).
- Password complexity pattern validator.
- register.tsx i18n (`useIntl` hardcoding — login.tsx uses `useIntl` while register hardcodes English).

---

## Specification

### S1: Register Request Payload Parity

**Requirement**: The POST body sent by `register()` to `/v1/auth/register` MUST mirror Angular's `registerOwner` requestData exactly.

**Shape**:
```typescript
{
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  storeName: string;
  code?: string;  // included ONLY when non-empty after trim
}
```

**Constraints**:
- `code` MUST be omitted entirely from the body when the value is empty string, whitespace-only, or undefined.
- `passwordConfirmation` MUST NEVER appear in the wire payload, even if passed to `register()`.
- All required fields MUST be present and non-empty.

**Rationale**: Angular auth-http.service.ts:51 includes code conditionally (`code && code.trim() !== ''`). React must replicate this logic exactly to avoid sending stale/empty values to the backend.

---

### S2: Register Return Type Parity (Updated 2026-07-30)

**Requirement**: `POST /api/v1/auth/register` returns `201 Created` with `ResponseResult<AuthDto>`.
The frontend `register()` MUST resolve to `Promise<BaseResponseModel<RegisterAuthModel>>`, a
**new, distinct** domain type — NOT `AuthModel`. `AuthModel.refreshToken` is required and
`AuthModel.expiresIn` is a `number`; the register response has no `refreshToken` and its
`expiresIn` is an ISO-8601 string, so `AuthModel` MUST NOT be reused or widened to fit it.

**Shape**:
```typescript
interface RegisterAuthModel {
  login: string;
  authToken: string;
  expiresIn: string; // ISO-8601 wire string — NOT epoch number
  // refreshToken intentionally absent: RegisterCommand.cs never sets one
}
```

**Constraints**:
- The return type MUST change from `BaseResponseModel<boolean>` to
  `BaseResponseModel<RegisterAuthModel>` — this REPLACES the `boolean` signature at
  `auth-http-service.ts:18`, which is false as of this change.
- `RegisterAuthModel` MUST be its own type; it MUST NOT alias or extend `AuthModel`.
- The service MUST return the envelope verbatim — no flattening, no selective `data` extraction.

(Previously: this section claimed the frontend extracts and stores `data.authToken` immediately
for "auto-login". That framing is INCORRECT for this change — see S3, Decision 1.)

#### Scenario: register() resolves with the real AuthDto shape, not a boolean
- GIVEN the backend responds 201 with `{ succeeded: true, data: { login: "juan", authToken: "eyJ...", expiresIn: "2026-08-29T00:00:00Z" } }`
- WHEN `authHttpService.register(...)` resolves
- THEN `result.data` has `login`, `authToken`, and a string `expiresIn`, with no `refreshToken` field
- AND `result.data` is never typed or coerced as `boolean` or as `AuthModel`

---

### S3: Response Envelope Handling at Call-Site (auto-login 2026-09-28)

**Requirement**: `register.tsx` MUST branch on whether `register()` resolves or rejects, NOT on a
resolved `succeeded: false` envelope. `AuthController.RegisterAsync` (backend) returns
`201 Created` on success and `BadRequest(result)` on EVERY failure
(`AuthController.cs:90-102`) — a `succeeded: false` envelope therefore NEVER resolves; axios
raises it as a rejection because the HTTP status is non-2xx. On a resolved response (always
`succeeded: true`) the registration MUST leave the owner **authenticated**: the call-site opens the
session through the auth store's own `login` action with the credentials just typed, arms the
usage tracker, warms the heavy route chunks and navigates to the home view
`resolveUserHomePath(user)` returns — `/login` is NEVER a success destination.

**The register response's own `data.authToken` is still deliberately NOT used to hydrate a
session.** `AuthDto` leaves `WrappedDek`/`WrapSalt`/`WrapIv` empty on the register path
("Only the login path populates them"; `Dtos/Authentication/AuthDto.cs`) and a brand-new device
has neither a device-key wrap nor a roster, so the register token cannot open the store's DEK: a
session persisted from it cannot decrypt its own store and the decryption-failure policy logs the
owner straight back out. The wrap — and therefore a usable session — only ever arrives with the
login response, which is why the auto-login goes through the login path.

**Flow**:
```
register() settles:
├─ resolves (always succeeded: true) → login(login, password) [auth store]
│   ├─ resolves → armTracking() + preloadHeavyChunks() → navigate(resolveUserHomePath(user))
│   └─ rejects (DekUnwrapError, /me verdict, network) → showBlockingError(REGISTRATION.AUTO_LOGIN_FAILED)
│         + navigate('/login')   [the account EXISTS — never report a failed registration]
└─ rejects (HTTP 4xx/5xx, including every succeeded:false case) → caught in the outer catch:
   ├─ status === 400 → setErrors({ form: response.data.errors[0]?.description ?? REGISTRATION.VALIDATION_ERROR })
   ├─ status === 429 → setErrors({ form: REGISTRATION.TOO_MANY_ATTEMPTS })
   └─ otherwise → setErrors({ form: REGISTRATION.UNEXPECTED_ERROR })
```

**Constraints**:
- On `register()` resolve, open the session via the auth store's `login` with the typed
  credentials and navigate to the resolved home view. `/login` MUST NOT be a success destination.
- `data.authToken` from the register response MUST NOT be persisted by this path — the session's
  token comes from the login response (see above).
- A failed auto-login MUST NOT be presented as a failed registration: it surfaces
  `REGISTRATION.AUTO_LOGIN_FAILED` and lands on `/login`, where the key-recovery routes live.
- The auto-login failure MUST be caught separately from the registration rejection branches, so an
  HTTP 400/429/500 mapping is never applied to a registration that already returned `201`.
- Failure text MUST be read from the rejection body's `errors[0].description`, guarding the array
  access (it MUST NOT index blindly) — `ResponseResult.Message` is always `null`
  (`ResponseResult.cs:14-17`; `ErrorHandlerMiddleware` only ever sets `.Errors`), so
  `response.data.message` MUST NOT be read for this purpose.
- A missing/empty `errors` array on an HTTP 400 falls back to the existing generic copy
  (`REGISTRATION.VALIDATION_ERROR`).
- The HTTP 429 branch is unchanged and independent of the description-reading logic above.

(Previously: required extracting and storing the JWT for "auto-login" as part of the success
branch. REJECTED by Decision 1 — Angular's `register.component.ts:75` navigates to `/login`
without authenticating; the forced re-login round trip is preserved on purpose.)

(Reversed 2026-09-28, owner request: a newly registered owner must not be sent to the login form.
The auto-login is NOT the rejected shape — it never persists the register response's JWT, and it
uses the login path precisely because that is the only response carrying the DEK wrap. Decision 1's
Angular-parity argument is superseded on this point; everything else in this section is unchanged.)

(Also previously: this section documented a resolved `succeeded === false` branch reading
`errors[0].description` directly off the resolved value, and a `response.data.message`-based
`REGISTRATION.EMAIL_TAKEN` mapping on HTTP 400. Both were INCORRECT — the backend never resolves a
failure (see Requirement above) and never populates `.Message`, so neither path was reachable.
That dead code has been removed from `register.tsx`, and the unreferenced `REGISTRATION.EMAIL_TAKEN`
i18n key has been removed from `es.ts`.)

#### Scenario: Successful registration leaves the owner authenticated
- GIVEN `register()` resolves with `succeeded: true` and `data.authToken` present
- WHEN the register flow completes
- THEN the auth store's `login` was called with the credentials the user typed
- AND the app navigates to the home view `resolveUserHomePath` returns
- AND the register response's own `data.authToken` was never persisted by this path

#### Scenario: A failed auto-login does not look like a failed registration
- GIVEN `register()` resolves with `succeeded: true`
- AND the subsequent sign-in rejects (e.g. `DekUnwrapError`)
- WHEN the register flow completes
- THEN `REGISTRATION.AUTO_LOGIN_FAILED` is shown (the account exists)
- AND the app navigates to `/login`
- AND `REGISTRATION.UNEXPECTED_ERROR` / `REGISTRATION.VALIDATION_ERROR` are NOT shown

#### Scenario: A rejected registration never attempts a sign-in
- GIVEN `register()` rejects with an HTTP 400
- WHEN the register flow completes
- THEN no auth-store `login` call is made
- AND no navigation occurs

#### Scenario: Registration failure surfaces the backend's literal description
- GIVEN `register()` rejects with an HTTP 400 response whose body is
  `{ succeeded: false, data: null, message: null, actionCode: 400, errors: [{ code: "Login", description: "..." }] }`
- WHEN the register flow completes
- THEN the form error is set to `errors[0].description`
- AND no navigation occurs

#### Scenario: HTTP 400 rejection with an empty errors array falls back to generic copy
- GIVEN `register()` rejects with an HTTP 400 response whose body has `errors: []`
- WHEN the register flow completes
- THEN the form error is set to `REGISTRATION.VALIDATION_ERROR`
- AND no navigation occurs

---

### S4: Register Form Supplies Contract Fields

**Requirement**: `register.tsx` MUST render form inputs for `login` and `storeName` (both required); read `code` from `?code` query parameter without rendering a visible input; keep `passwordConfirmation` as client-only validation.

**Form State**:
```typescript
{
  fullName: string;
  login: string;         // NEW: required input, mirrors Angular register.component.html:82-88
  password: string;
  cellPhone: string;
  email: string;
  storeName: string;     // NEW: required input, mirrors Angular register.component.html:174-188
  passwordConfirmation: string; // LOCAL ONLY: client-side validation, NOT in wire payload
}

// code is read via useSearchParams, NOT stored in form state, NOT rendered as input
```

**Constraints**:
- `login` and `storeName` inputs MUST be required (validation blocks submit while empty).
- `code` MUST be read from the query string (`?code=ABC123`) via `useSearchParams()` and included in the payload; no visible input field.
- `passwordConfirmation` MUST remain a client-only field used solely for password-match validation; it MUST NOT appear in the payload passed to `register()`.

**Rationale**: Angular's form has separate required controls for `login` and `storeName`. The `code` is programmatic (from query param), not user-entered. The `passwordConfirmation` is Angular-sourced as a client control (confirmPassword) but was never in Angular's `requestData` — it is local validation only.

---

### S5: RegisterRequest Model Mirrors Angular requestData Shape

**Requirement**: The `RegisterRequest` TypeScript model MUST declare exactly the fields present in Angular's `registerOwner` requestData parameter.

**Model**:
```typescript
interface RegisterRequest {
  fullName: string;
  login: string;
  password: string;
  cellPhone: string;
  email: string;
  storeName: string;
  code?: string;
}
// Note: NO passwordConfirmation field
```

**Constraints**:
- `code` MUST be optional (`?`).
- `passwordConfirmation` MUST NOT be declared in the model.
- All other fields MUST be required (non-optional).

**Rationale**: Angular's service receives a `requestData` object with exactly these fields. React's model MUST match (rule 12: mirror, do not invent or remove). `passwordConfirmation` is local UI validation, not part of `requestData`.

---

### S6: getMe() Billing Fields Raw Passthrough

**Requirement**: `UserModel` MUST declare `paymentDueDate: string | null`, `isInTrial: boolean`,
`paymentStatus: PaymentStatus`. `authHttpService.getMe()` MUST remain a raw passthrough
(`return response.data.data`) — it MUST NOT gain a mapping/defaulting step for these fields. The
backend (`CurrentUserDto`) always serializes non-null defaults (`'NoAplica'`/`false`/`null`); any
defaulting for a stale/offline payload missing these fields is the CONSUMER's responsibility
(e.g. `PaymentBanner` reading `user?.paymentStatus ?? 'NoAplica'`), not `getMe`'s.

**Shape**:
```typescript
export type PaymentStatus = 'NoAplica' | 'AlDia' | 'PorVencer' | 'EnGracia' | 'Vencido';
// UserModel += paymentDueDate: string | null; isInTrial: boolean; paymentStatus: PaymentStatus;
```

**Constraints**:
- `getMe()` MUST NOT transform, default, or drop these three fields.
- A stale/offline payload missing the fields yields `undefined` on the returned object; `getMe`
  does not default them — defaulting is consumer-side.

**Rationale**: Added by SDD change `store-paid-plan-billing-frontend` (archived 2026-07-27). NEW
feature work — no Angular source exists for this contract (the paid-plan billing lifecycle is
backend-new). This requirement locks `getMe()` as the project's one remaining pure passthrough,
consistent with S2/S3 above which already forbid envelope flattening or transformation at this
layer.

#### Scenario: Fields present in response
- GIVEN `getMe` resolves with `paymentDueDate: '2026-03-10'`, `isInTrial: true`, `paymentStatus: 'PorVencer'`
- WHEN `authHttpService.getMe()` returns
- THEN `UserModel.paymentDueDate/isInTrial/paymentStatus` carry the same values unchanged, with no transform applied

#### Scenario: Fields absent from a stale payload
- GIVEN a payload lacking the three fields (pre-backend-merge or stale offline cache)
- WHEN `authHttpService.getMe()` returns
- THEN the fields are `undefined` on the returned object (getMe does not default them); a consumer reading `user?.paymentStatus ?? 'NoAplica'` treats it as `NoAplica`

---

## Verification Criteria

- [x] All 5 spec requirements are implemented and test-covered.
- [x] S2 updated: `register()` returns `Promise<BaseResponseModel<RegisterAuthModel>>` — service tests verify `RegisterAuthModel` shape including `login`, `authToken`, string `expiresIn`, and no `refreshToken`.
- [x] S3 updated (2026-09-28): on success the call-site opens the session through the auth store's `login` (auto-login), still without persisting the register response's `authToken`; a failed auto-login surfaces `REGISTRATION.AUTO_LOGIN_FAILED` and lands on `/login`. Supersedes the 2026-07-31 `navigate('/login')` behavior.
- [x] S6: `getMe()` billing fields passthrough — `UserModel` carries `paymentDueDate`/`isInTrial`/`paymentStatus` unchanged; no mapping added.
- [x] Service tests verify: body includes login/storeName, excludes passwordConfirmation, includes code only when non-empty (trim), returns `BaseResponseModel<RegisterAuthModel>`.
- [x] Component tests verify: form renders login/storeName, code flows from query param without visible input, passwordConfirmation blocks submit locally and is never sent, the success branch signs in with the typed credentials and navigates to the home view (never `/login`), a failing sign-in surfaces `REGISTRATION.AUTO_LOGIN_FAILED` and goes to `/login`, and a rejected registration never attempts a sign-in.
- [x] Rate-limit feedback (auth-rate-limit-feedback capability): login/register surface distinct copy on HTTP 429, existing non-429 branches unchanged.
- [x] Backend: 52 unit tests + 11 E2E tests passing; `POST /api/v1/auth/register` returns `201 Created` with `AuthDto`.
- [x] Rate limiting: `RegisterPolicy` (10 req / 10 min per IP) configured, returns 429 on excess.
- [x] Full regression gate: typecheck 5/5 packages, zero build warnings.

---

## Related Specifications

- **auth-http-login** (not yet defined; future Slice 3 will formalize login contract similarly)
- **auth-authorization** (Slice 4 — not yet specified; deferred decision-gates for terms, email validation, cellPhone masking)
- **usage-tracker** (Slice 5 — out of auth-http scope)
- **auth-rate-limit-feedback** (added by `register-endpoint-contract-frontend`): defines the HTTP
  429 copy surfaced on `login.tsx`/`register.tsx`; a sibling capability, not folded into this file
  because it governs UI copy branching, not the HTTP contract itself.

---

## Implementation Status

- **RegisterRequest model**: ✓ Done (packages/domain/src/models/auth.ts)
- **register() service**: ✓ Done (app/shared/lib/http/auth-http-service.ts)
- **register.tsx call-site**: ✓ Done (app/auth/routes/register.tsx)
- **Tests**: ✓ Done (auth-http-service.test.ts, register.test.tsx)
- **PRD documentation**: ✓ Done (docs/prd/auth.md corrected)
- **S6 getMe() billing fields passthrough**: ✓ Done (`packages/domain/src/models/auth.ts`,
  `app/shared/lib/http/auth-http-service.ts` — body unchanged, test-only touch; SDD change
  `store-paid-plan-billing-frontend`, archived 2026-07-27)

---

## Notes

- This specification captures Slice 2 of a 5-slice auth cluster (Fase 1). Slices 3–5 will define login, authorization, and usage-tracker.
- Decision-gates (a), (b), (c) above remain open; they do not block this slice's completion.
- Backend contract is specified from Angular source only (rule 1); no live API validation is performed.
- S6 (`getMe()` billing fields) was added later by SDD change `store-paid-plan-billing-frontend`
  (archived 2026-07-27) — NEW feature work, no Angular source. It was merged into this capability
  rather than `auth-session` or `auth-authorization` because it is purely a transport/passthrough
  contract on `authHttpService`, matching this capability's scope (S1-S3 already govern
  `getMe`'s sibling `register()` transport contract on the same service file); `auth-session`
  governs store-lifecycle behavior (logout/getUserByToken) and `auth-authorization` governs
  `isUserAuthorized` checks — neither is about HTTP transport shape.
