# `login` is not `email`

A user has **two distinct fields**, and they are not interchangeable:

| Field | What it is | Required? |
|---|---|---|
| `login` | The credential typed to sign in. A username, not an address. | **Yes** |
| `email` | A contact address. | **No** — optional everywhere |

The wire already gets this right. `POST /v1/auth/login` takes `{ login, password }`
(`frontend-react/apps/web-store-pos/app/shared/lib/http/auth-http-service.ts:12`), and no
backend validator requires `Email` — all seven that mention it wrap the rule in
`When(x => !string.IsNullOrEmpty(x.Email), ...)` and check **format only**.

What is wrong is the naming and the input semantics **above** that boundary, on the
sign-in screen. The value is a login all the way down; it is only called `email`.

## Sites to fix

### 1. The sign-in form calls its login field `email`

`frontend-react/apps/web-store-pos/app/auth/routes/login.tsx`

| Line | What it says | Why it is wrong |
|---|---|---|
| 17, 22 | `FormState.email`, `FormErrors.email` | The state holds a login |
| 67, 80, 109, 131, 222-223 | `form.email` | Passed straight to `login()` / `loginOffline()` |
| 219 | `id="email"` | Names the login input after the wrong field |
| 220 | `type="email"` | Browser-level email semantics on a username |
| 221 | `autoComplete="email"` | Offers saved email addresses for a username field |

The visible label is already correct — line 216 renders `GENERAL.LOGIN` ("Usuario").

**On `type="email"`:** it does not break sign-in today only because the form carries
`noValidate` (line 213), which suppresses the browser's own constraint validation. Remove
`noValidate` and every username without an `@` stops submitting. The correct type is
`text`, and `autoComplete` should be `username`.

### 2. The error message contradicts the label

`login.tsx:81` raises `AUTH.EMAIL_REQUIRED` — **"El email es requerido"**
(`shared/lib/i18n/es.ts:67`) — for a field the very same screen labels "Usuario".
A user who submits an empty form is told to fill in an email that the screen never asked
for. This is the only user-visible symptom of the whole conflation.

It should raise a login-required message. `GENERAL.LOGIN` ("Usuario") already exists as
the field name; `register.tsx:69` shows the shape — `requiredError(GENERAL.LOGIN)`.

`AUTH.EMAIL` ("Email", `es.ts:66`) belongs to real email fields and stays.

### 3. `useAuthStore.login()` names its first parameter `email`

`shared/lib/stores/auth-store.ts:80` and `:217` — `login: (email: string, password: string)`.

Line 223 gives the game away: `authHttpService.login({ login: email, password })`. The
value is renamed back to `login` at the boundary, so the parameter was never an email.

The same store gets it right ten lines down: `loginOffline: (login: string, ...)` (`:330`).
Two spellings for the same argument in one store.

## What is already correct — do not "fix" it

- `auth-http-service.ts:12` — `LoginPayload.login`.
- `register.tsx` — labels the credential `GENERAL.LOGIN` and carries `email` as a separate,
  optional field.
- `es.ts:691` `USERS.LOGIN` and `:790` `GENERAL.LOGIN`, both "Usuario".
- Every backend validator's optional-email rule.

## Before changing `id="email"`: ask

Three **existing** E2E tests select that input by id:

- `frontend-react/e2e/support/login-page.ts:26` — `page.locator('#email')`
- `frontend-react/e2e/login.spec.ts:133` and `:139` — assert the input is absent

Renaming the id breaks them. Per `CLAUDE.md`, touching an existing E2E test requires
explicit authorization from the user — ask before starting, not after the suite goes red.

Note that `register-page.ts:51` also uses `#email`, but on the register screen that
selector points at the genuine email field. It is unaffected.
