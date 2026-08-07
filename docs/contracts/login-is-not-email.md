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

## Still open — the phone rules

Decided 2026-08-07, **not yet implemented**. The email side is done; the phone is the
remaining work. The phone stops being a global requirement and becomes an **owner and
reseller** requirement.

| Path | Target rule | Today | Action |
|---|---|---|---|
| Create/edit **owner** (frontend) | no validation | `PHONE_REGEX` `/^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/` at `owner-create.tsx:80`, `owner-edit.tsx:200` | drop the regex |
| Create/edit **reseller** (frontend) | no validation | same regex at `reseller-create.tsx:59`, `reseller-edit.tsx:106` | drop the regex |
| **Edit user** | never validated | frontend requires it (`UserDetailsForm.tsx:46`); backend has no rule | drop the frontend check |
| **Create store user** | never validated | neither `UserCreateForm.tsx` nor `CreateStoreUserCommandValidator` validates | already correct — verify only |
| **Edit own profile** | required **only when the user is an owner or a reseller** | `edit-profile-form.tsx:42` requires it always | make it conditional on the role |

The regex is the reason: it forces a Cuban `+53` number on every phone, which is not a rule
this product wants to make.

### Two decisions left open, on purpose

1. **Registration was not mentioned.** It requires the phone in both layers today
   (`register.tsx:71`, `RegisterCommandValidator.cs:32`), and registration creates an
   OwnerAdmin — which "required for owners" would keep. Assume it stays required unless
   stated otherwise.
2. **The backend `NotEmpty` rules for owner and reseller stay** (`CreateOwner:35`,
   `UpdateOwner:22`, `CreateReSeller:48`, `UpdateReSeller:32`). Once the frontend stops
   validating, the user meets a server error instead of an inline one. That is consistent
   with the target rule, but the backend message has to render properly in those forms
   before the work counts as done.

Before touching any of it: check whether an existing E2E test asserts these validations.
The rule in `CLAUDE.md` applies — ask first.
