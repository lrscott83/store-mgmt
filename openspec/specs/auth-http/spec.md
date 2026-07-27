# auth-http Capability Specification

**Capability**: auth-http registration contract  
**Origin**: SDD change `auth-http-register-parity` (Slice 2, Fase 1 — auth cluster)  
**Status**: Active  
**Last Updated**: 2026-07-12

---

## Purpose

Define the HTTP contract for user registration in the auth-http service layer. This specification ensures that the React registration flow mirrors the Angular `registerOwner` contract exactly: request payload shape, response envelope type, and form-to-service data flow.

---

## Capability Scope

### In Scope
- **RegisterRequest model shape**: Required fields (`fullName`, `login`, `password`, `cellPhone`, `email`, `storeName`) and optional `code` field; explicit exclusion of `passwordConfirmation` from the wire payload.
- **register() service contract**: POST to `/v1/auth/register` with conditional code inclusion; return type `Promise<BaseResponseModel<boolean>>`.
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

### S2: Register Return Type Parity

**Requirement**: `register()` MUST return `Promise<BaseResponseModel<boolean>>`, matching Angular's `Observable<BaseResponseModel<boolean>>` under the Observable→Promise transformation.

**Shape**:
```typescript
Promise<BaseResponseModel<boolean>>

// BaseResponseModel<boolean> structure:
{
  succeeded: boolean;
  data?: boolean;
  errors?: Array<{ code?: string; description: string }>;
}
```

**Constraints**:
- Return type MUST NOT be `Promise<BaseResponseModel<void>>` or any other generic parameter.
- The service MUST return the envelope verbatim; no flattening, no selective extraction of `data`.

**Rationale**: Angular's `registerOwner` is typed `Observable<BaseResponseModel<boolean>>`. Rule 3 (signature parity) requires the return shape to match exactly.

---

### S3: Response Envelope Handling at Call-Site

**Requirement**: `register.tsx` MUST branch on the `succeeded` field of the resolved response envelope. No envelope flattening; no conflation of transport errors with envelope-false.

**Flow**:
```
register() resolves:
├─ succeeded === true → setSuccess(true) + navigate('/login')
├─ succeeded === false → setErrors({ form: errors[0].description })
└─ (does not throw; transport errors caught separately in outer catch)
```

**Constraints**:
- Navigate to `/login` ONLY when `succeeded === true`.
- Surface `errors[0].description` as the user-facing error message ONLY when `succeeded === false`.
- Network/HTTP transport failures (axios throw) MUST be caught in a separate outer catch block, independent of the envelope branch.
- The envelope MUST be returned verbatim by the service, not transformed or reduced by the service layer.

**Rationale**: Angular register.component.ts:72-82 branches on `response.succeeded`. Migration rule 10 (call-sites use the same logic) requires identical branching.

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
- [x] S6: `getMe()` billing fields passthrough — `UserModel` carries `paymentDueDate`/`isInTrial`/`paymentStatus` unchanged; no mapping added.
- [x] Service tests verify: body includes login/storeName, excludes passwordConfirmation, includes code only when non-empty (trim), returns BaseResponseModel<boolean>.
- [x] Component tests verify: form renders login/storeName, code flows from query param without visible input, passwordConfirmation blocks submit locally and is never sent, envelope branch succeeds on true/false, navigate only on success.
- [x] Full regression gate: typecheck 5/5 packages, 1567/1567 tests passing, zero build warnings.
- [x] Cross-verified against Angular source: auth-http.service.ts:32-56, register.component.ts:72-82.

---

## Related Specifications

- **auth-http-login** (not yet defined; future Slice 3 will formalize login contract similarly)
- **auth-authorization** (Slice 4 — not yet specified; deferred decision-gates for terms, email validation, cellPhone masking)
- **usage-tracker** (Slice 5 — out of auth-http scope)

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
