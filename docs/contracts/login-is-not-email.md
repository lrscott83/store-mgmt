# `login` is not `email`

A user has **two distinct fields**, and they are not interchangeable:

| Field | What it is | Required? |
|---|---|---|
| `login` | The credential typed to sign in. A username, not an address. | **Yes** |
| `email` | A contact address. | **No** — optional everywhere |

The wire always got this right. `POST /v1/auth/login` takes `{ login, password }`
(`frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts:12`), and no
backend validator requires `Email` — all seven that mention it wrap the rule in
`When(x => !string.IsNullOrEmpty(x.Email), ...)` and check **format only**.

What was wrong was the naming and the input semantics **above** that boundary, on the
sign-in screen. The value was a login all the way down; it was only ever called `email`.
Corrected on 2026-08-07 by explicit decision.

## What changed

### The sign-in form now names its field `login`

`apps/web-store-pos/app/auth/routes/login.tsx` — `FormState.login`, `FormErrors.login`,
`form.login`, `id="login"`, `aria-describedby="login-error"`.

`type` moved from `email` to **`text`**, and `autoComplete` from `email` to **`username`**.

The old `type="email"` did not break sign-in only because the form carries `noValidate`
(`login.tsx:213`), which suppresses the browser's own constraint validation. Remove
`noValidate` and every username without an `@` stops submitting. That was a live trap, not
untidiness.

The visible label was already correct — it renders `GENERAL.LOGIN` ("Usuario").

### Two user-visible strings said "email" about the login

| Key | Was | Now |
|---|---|---|
| `AUTH.EMAIL_REQUIRED` → `AUTH.LOGIN_REQUIRED` | "El email es requerido" | "El usuario es requerido" |
| `AUTH.INVALID_CREDENTIALS` | "Email o contraseña inválidos" | "Usuario o contraseña inválidos" |

Both in `apps/web-store-pos/app/shared/lib/i18n/es.ts`. The first contradicted its own
screen, which labels the field "Usuario". The second is shown on **every failed login**.

`AUTH.EMAIL` ("Email"), `PROFILE.EMAIL`, `USERS.EMAIL`, `GENERAL.EMAIL` and
`PROFILE.INVALID_EMAIL` describe real email fields and are untouched.

### `useAuthStore.login()` named its first parameter `email`

`shared/lib/stores/auth-store.ts:80` and `:217`. The body gave it away —
`authHttpService.login({ login: email, password })` renamed the value back at the boundary,
so the parameter was never an email. It is now `login`, matching `loginOffline(login, ...)`
ten lines below, which had it right all along.

### Tests that pinned the old behavior

- `auth/routes/__tests__/login.test.tsx` — the `view-text-parity` pin
  *"keeps input type="email" and autoComplete="email" unchanged"* existed **specifically**
  to hold the old attributes as literal Angular parity. It now pins the opposite, and says
  why. This is a deliberate divergence from Angular, decided by the product owner.
- `login.offline.test.tsx` and `login.test.tsx` — the literal invalid-credentials copy.
- `e2e/support/login-page.ts` — locator `#email` → `#login`, field `email` → `login`
  (it already filled it from `identity.login`).
- `e2e/login.spec.ts` — the `#login` absence assertions and both literal copy constants.

Touching those E2E files was authorized explicitly on 2026-08-07. Absent that
authorization the rule in `CLAUDE.md` stands: ask first, every time.

## What is correct — do not "fix" it

- `auth-http-service.ts:12` — `LoginPayload.login`.
- `register.tsx` — labels the credential `GENERAL.LOGIN` and carries `email` as a separate,
  optional field.
- `es.ts` `USERS.LOGIN` and `GENERAL.LOGIN`, both "Usuario".
- `e2e/support/register-page.ts` — its `#email` selector points at the register screen's
  genuine email field.
- Every backend validator's optional-email rule.

## Still open

`CellPhone` **is** required today — `RegisterCommandValidator.cs:32`,
`CreateOwnerCommandValidator.cs:35`, `UpdateOwnerCommandValidator.cs:22`,
`UpdateReSellerCommandValidator.cs:32`, plus `register.tsx` and `UserDetailsForm.tsx`.
`CreateStoreUserCommandValidator` does **not** require it, while the form that feeds it
does — front and back disagree on that path. Making the phone optional is a separate,
pending change.
