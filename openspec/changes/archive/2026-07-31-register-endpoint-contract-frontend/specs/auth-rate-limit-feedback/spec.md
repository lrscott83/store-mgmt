# Delta for auth-rate-limit-feedback

## Purpose

Define how `login.tsx` and `register.tsx` surface HTTP 429 (rate-limited) responses with
copy distinct from their existing generic-error branches, and pin the existing non-429 error
branches on both pages so the new branch does not regress them.

## Requirements

### Requirement: Login surfaces a distinct message on HTTP 429

When the login request rejects with HTTP status `429`, the login page MUST render a message
drawn from a NEW `AUTH.*` i18n key. That message MUST NOT be `AUTH.SERVER_ERROR`'s copy and MUST
NOT be `AUTH.INVALID_CREDENTIALS`'s copy.

#### Scenario: Login rejected with 429 renders the rate-limit copy, not server-error or invalid-credentials copy
- GIVEN the login request rejects with an error whose `.status` is `429`
- WHEN `login.tsx`'s catch handler resolves the error copy
- THEN the rendered message is the new `AUTH.*` rate-limit key's copy
- AND it is neither `AUTH.SERVER_ERROR`'s ("Algo salió mal. Intentá de nuevo.") nor `AUTH.INVALID_CREDENTIALS`'s copy

---

### Requirement: Register surfaces a distinct message on HTTP 429

When the register request rejects with HTTP status `429`, the register page MUST render a message
drawn from a NEW `REGISTRATION.*` i18n key. That message MUST NOT be `REGISTRATION.UNEXPECTED_ERROR`'s copy.

#### Scenario: Register rejected with 429 renders the rate-limit copy, not the unexpected-error copy
- GIVEN the register request rejects with an error whose `.response.status` is `429`
- WHEN `register.tsx`'s catch handler resolves the error copy
- THEN the rendered message is the new `REGISTRATION.*` rate-limit key's copy
- AND it is NOT `REGISTRATION.UNEXPECTED_ERROR`'s copy

---

### Requirement: Existing non-429 login/register error branches do not regress

Adding the 429 branch MUST NOT change any existing status-to-copy mapping on either page.

#### Scenario: Login 401 still renders invalid-credentials copy
- GIVEN the login request rejects with `.status === 401`
- WHEN the catch handler resolves the error copy
- THEN the rendered message is `AUTH.INVALID_CREDENTIALS`

#### Scenario: Login 403 still renders account-inactive copy
- GIVEN the login request rejects with `.status === 403`
- WHEN the catch handler resolves the error copy
- THEN the rendered message is `AUTH.ACCOUNT_INACTIVE`

#### Scenario: Register 400 with an email collision still renders email-taken copy
- GIVEN the register request rejects with `.response.status === 400` and the error description
  refers to the email
- WHEN the catch handler resolves the error copy
- THEN the rendered message is `REGISTRATION.EMAIL_TAKEN`

#### Scenario: Register 400 without an email collision still renders validation-error copy
- GIVEN the register request rejects with `.response.status === 400` and the error description
  does not refer to the email
- WHEN the catch handler resolves the error copy
- THEN the rendered message is `REGISTRATION.VALIDATION_ERROR`
