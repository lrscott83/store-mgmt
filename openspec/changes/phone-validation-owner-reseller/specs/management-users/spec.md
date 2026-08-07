# Delta for Management Users

**Change**: `phone-validation-owner-reseller`
**Type**: Modified capability — frontend specification delta (React `apps/web-store-pos`)

## MODIFIED Requirements

### Requirement: Edit User No Longer Requires A Phone

`UserDetailsForm.tsx` is reachable only from `user-edit.tsx` (its sole caller). Its `handleSubmit`
currently blocks submission when `cellPhone` is empty, showing `USERS.CELL_PHONE_REQUIRED`
(`UserDetailsForm.tsx:46-49`). Neither Angular parity nor the backend requires this — the backend
has no `CellPhone` rule for user update (verified: no `RuleFor(x => x.CellPhone)` in
`UpdateUserCommandValidator.cs`). This requirement removes the frontend-only block.

(Previously: any empty `cellPhone` unconditionally set `cellPhoneError` to
`USERS.CELL_PHONE_REQUIRED` and prevented `onSubmit` from firing.)

#### Scenario: Empty phone saves in edit-user
- GIVEN the edit-user form has `cellPhone` empty
- WHEN the admin submits
- THEN `onSubmit` is called with `cellPhone: ''`
- AND `cellPhoneError` is never set

#### Scenario: A non-empty phone still saves as before
- GIVEN the edit-user form has a non-empty `cellPhone`, any format
- WHEN the admin submits
- THEN `onSubmit` is called with that `cellPhone` value, unchanged from today

## Unchanged By This Change

### Requirement: Create Store User Never Required A Phone

`UserCreateForm.tsx` has no phone validation today and gets none added by this change. This is a
verification checkpoint only — see `phone-requirement` delta's PHONE-4 for the full scenario.
