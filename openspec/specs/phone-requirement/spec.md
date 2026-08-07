# Delta for Phone Requirement

**Change**: `phone-validation-owner-reseller`
**Type**: New capability — frontend specification delta (React `apps/web-store-pos`)
**Source**: `docs/contracts/login-is-not-email.md:79-109` ("Still open — the phone rules")

Defines where the cellphone is a required field after this change and where it is not. The
`PHONE_REGEX` Cuban-format check (`/^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/`) is dropped everywhere on
the frontend; the phone stops being a global requirement and becomes an owner-and-reseller one. The
backend `NotEmpty`/`NotNull` rules for owner and reseller are unchanged — see the
`admin-owners-resellers` delta in this same change for how their 400 rejection now renders.

## ADDED Requirements

### Requirement: PHONE-1 — Owner And Reseller Forms Stop Validating Phone Format On The Frontend

`owner-create.tsx`, `owner-edit.tsx`, `reseller-create.tsx`, and `reseller-edit.tsx` MUST NOT block
submission on `cellPhone` format. The `PHONE_REGEX` constant and its `.test(cellPhone)` guard
(`owner-create.tsx:21,80`; `owner-edit.tsx:27,200`; `reseller-create.tsx:16,59`;
`reseller-edit.tsx:14,106`) MUST be removed from all four files. The `cellPhone` input itself stays
in the form — only the client-side format check is removed.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Non-Cuban format no longer blocks owner create | `cellPhone` holds a value that fails the old Cuban-format regex (e.g. `"555-1234"`) | The admin submits an otherwise-valid owner-create form | No `validationError` is set for phone format; the request reaches `ownerHttpService.createOwner` |
| 2 | Empty phone no longer blocks owner create | `cellPhone` is empty | The admin submits an otherwise-valid owner-create form | No `validationError` is set for phone format; the request reaches `ownerHttpService.createOwner` |
| 3 | Same for owner edit | `cellPhone` is empty or non-Cuban format | The admin submits an otherwise-valid owner-edit form | No `validationError` is set for phone format; the request reaches `ownerHttpService.updateOwner` |
| 4 | Same for reseller create | `cellPhone` is empty or non-Cuban format | The admin submits an otherwise-valid reseller-create form | No `validationError` is set for phone format; the request reaches `resellerHttpService.createReseller` |
| 5 | Same for reseller edit | `cellPhone` is empty or non-Cuban format | The admin submits an otherwise-valid reseller-edit form | No `validationError` is set for phone format; the request reaches `resellerHttpService.updateReseller` |

### Requirement: PHONE-2 — Editing A User No Longer Requires A Phone

`UserDetailsForm.tsx`'s `handleSubmit` MUST NOT block on an empty `cellPhone`. The
`!cellPhone.trim()` guard and its `USERS.CELL_PHONE_REQUIRED` message (`UserDetailsForm.tsx:46-49`)
MUST be removed. This form is reachable only from `user-edit.tsx` (its sole caller); the backend has
no `CellPhone` rule for user update (verified: no `RuleFor(x => x.CellPhone)` in
`UpdateUserCommandValidator.cs`), so no server-side rejection needs handling here either.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty phone saves | `cellPhone` is empty in the edit-user form | The admin submits | `onSubmit` is called with `cellPhone: ''`; no `cellPhoneError` is set |

### Requirement: PHONE-3 — Editing Your Own Profile Requires A Phone Only If You Are Owner Or Reseller

`edit-profile-form.tsx`'s required-field check (`edit-profile-form.tsx:42`,
`!fullName.trim() || !cellPhone.trim()`) MUST split so that `cellPhone` is required only when the
signed-in user is an owner or a reseller. `fullName` stays unconditionally required — this
requirement changes nothing about that half of the check.

The `EditProfileForm` component does not currently receive `user`; the route
(`profile/routes/edit-profile.tsx`) already holds `user` via `useAuthStore()` and MUST compute
`isOwnerAdmin(user) || isReSeller(user)` (`shared/lib/auth/authorization-service.ts:8-14`,
booleans off `UserModel` — `packages/domain/src/models/auth.ts:40-57`; there is no `ERoles` field on
this model) and pass the result down as a primitive `phoneRequired` boolean prop, matching the
primitive-props shape `EditProfileForm` already uses.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Owner blocked on empty phone | The signed-in user has `isOwnerAdmin === true` and submits with `cellPhone` empty | The admin submits the edit-profile form | `PROFILE.REQUIRED` is shown; `onSubmit` is NOT called |
| 2 | Reseller blocked on empty phone | The signed-in user has `isReSeller === true` and submits with `cellPhone` empty | The admin submits | `PROFILE.REQUIRED` is shown; `onSubmit` is NOT called |
| 3 | Store user passes with empty phone | The signed-in user has both `isOwnerAdmin === false` and `isReSeller === false` and submits with `cellPhone` empty | The store user submits | `onSubmit` IS called with `cellPhone: ''` |
| 4 | Full name stays required for everyone | Any signed-in user submits with `fullName` empty (phone filled or not) | The user submits | `PROFILE.REQUIRED` is shown; `onSubmit` is NOT called — unchanged from today |

## Unchanged By This Change

### Requirement: PHONE-4 — Create Store User Never Validated The Phone, And Still Doesn't

Neither `UserCreateForm.tsx` (no `PHONE_REGEX`, no `.trim()` guard on `cellPhone` — verified: the
component reads and formats `cellPhone` but never validates it) nor
`CreateStoreUserCommandValidator.cs` (verified: no `RuleFor(x => x.CellPhone)` among its rules) has
ever required a phone. This change makes no modification here — it is a verification checkpoint,
not a code change.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty phone always passed | `cellPhone` is empty on the create-store-user form | The admin submits | The request reaches the backend unblocked by the frontend, exactly as before this change |

### Requirement: PHONE-5 — Registration Keeps Requiring The Phone In Both Layers

`auth/routes/register.tsx:71` and `RegisterCommandValidator.cs:32` are untouched by this change.
Registration creates an `OwnerAdmin`, which the target rule ("required for owner or reseller")
would keep requiring; the contract explicitly leaves this decision closed ("Assume it stays
required unless stated otherwise" — `login-is-not-email.md:98-101`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Empty phone still blocks registration | `cellPhone` is empty on the registration form | A user submits | Registration is blocked exactly as it is today — frontend and backend both still require it |

## Non-Requirements (Explicit Exclusions)

- MUST NOT introduce a per-field error slot on any of the four admin owner/reseller forms. The 400
  → copy mapping (specified in this change's `admin-owners-resellers` delta) renders in the
  existing single `role="alert"` banner, not inline on the `cellPhone` field.
- MUST NOT touch any file under `frontend-react/e2e/` — no Playwright spec asserts phone-requirement
  behavior (verified in `explore.md`); `frontend-react/e2e/` shows no diff is a success criterion of
  this change.
- MUST NOT change any backend validator. `CreateOwnerCommandValidator.cs:35`,
  `UpdateOwnerCommandValidator.cs:22`, `CreateReSellerCommandValidator.cs:48`,
  `UpdateReSellerCommandValidator.cs:32` keep their `NotNull()`/`NotEmpty()` rules on `Cellphone` /
  `CellPhone` exactly as they are today.
- MUST NOT change the `+53 0 000-0000` input mask used by `management-users`
  (`cell-phone-mask.ts`) — that is display formatting, not validation, and is out of scope.
