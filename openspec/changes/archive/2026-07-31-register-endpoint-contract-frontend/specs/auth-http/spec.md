# Delta for auth-http

## MODIFIED Requirements

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

### S3: Response Envelope Handling at Call-Site (Updated 2026-07-30)

**Requirement**: `register.tsx` MUST branch on the `succeeded` field. On `succeeded === true` it
MUST navigate to `/login` — this behavior is **REAFFIRMED unchanged** (Angular parity, Decision 1:
no auto-authentication). The resolved `data.authToken` MUST be received and typed but MUST NOT be
persisted, stored, or used to hydrate a session on this path — it is deliberately discarded.

**Flow**:
```
register() resolves:
├─ succeeded === true → navigate('/login') — authToken received, deliberately unused
├─ succeeded === false → setErrors({ form: errors[0].description })
└─ (does not throw; transport errors caught separately in the outer catch)
```

**Constraints**:
- Navigate to `/login` unconditionally on `succeeded === true`.
- No branch of the register success path MUST read `data.authToken` to hydrate a session, call an
  auth-store login/session action, or otherwise authenticate the user.
- Surface `errors[0].description` ONLY when `succeeded === false`.
- Network/HTTP transport failures MUST be caught in a separate outer catch block, independent of
  the envelope branch.

(Previously: required extracting and storing the JWT for "auto-login" as part of the success
branch. REJECTED by Decision 1 — Angular's `register.component.ts:75` navigates to `/login`
without authenticating; the forced re-login round trip is preserved on purpose.)

#### Scenario: Successful registration navigates to /login without consuming the token
- GIVEN `register()` resolves with `succeeded: true` and `data.authToken` present
- WHEN the register flow completes
- THEN the app navigates to `/login`
- AND no code path reads `data.authToken` to hydrate a session or invoke a login/auth-store action

#### Scenario: Registration failure still surfaces the description
- GIVEN `register()` resolves with `succeeded: false` and `errors: [{ description: "..." }]`
- WHEN the register flow completes
- THEN the form error is set to `errors[0].description`
- AND no navigation occurs
