# Delta for Admin Owners & Resellers

**Change**: `phone-validation-owner-reseller`
**Type**: Modified capability — frontend specification delta (React `apps/web-store-pos`)

Once the frontend stops validating phone format (`phone-requirement` delta, this same change), an
owner or reseller submitted with an empty phone reaches the backend, which still requires it
(`CreateOwnerCommandValidator.cs:35`, `UpdateOwnerCommandValidator.cs:22`,
`CreateReSellerCommandValidator.cs:48`, `UpdateReSellerCommandValidator.cs:32`). The backend rejects
with HTTP 400 and a body shaped `{ errors: [{ code, description }] }`, where `code` is the
FluentValidation `PropertyName` (`ValidationException.cs:20`, `new Error(failure.PropertyName,
failure.ErrorMessage)`) and `description` is the interpolated backend message. `PropertyName`
mirrors the field name declared on the command DTO, not the validator file: `CreateOwnerCommand.cs:20`
declares `string Cellphone`; `UpdateOwnerCommand.cs:24` declares `string CellPhone`. The ReSeller
side splits identically: `CreateReSellerCommand.cs:24` declares `string Cellphone`;
`UpdateReSellerCommand.cs:18` declares `string CellPhone`. The validator's `RuleFor(x => x.Cellphone)`
/ `RuleFor(x => x.CellPhone)` just closes over whichever casing its own command record declares.

Today that 400 is swallowed into the generic `OWNER.ERROR` / `RESELLERS.ERROR` copy ("Ocurrió un
error. Intentá de nuevo.", `es.ts:765` / `es.ts:743`). This delta makes the four admin forms render
a message distinct from that generic one when the rejection is the phone-required failure, and
confines that render to the existing single-banner idiom that already exists in these four files.

**Correction (design-phase finding, verified here)**: the mapping MUST NOT read only
`errors[0]`. FluentValidation's default class-level cascade mode is `Continue` — every declared
`RuleFor` runs and every failure is collected, in **rule-declaration order**, not phone-first order.
Verified: `CreateOwnerCommandValidator.cs` declares `RuleFor(x => x.FullName)` at `:31`, three lines
before `RuleFor(x => x.Cellphone)` at `:35`; `CreateReSellerCommandValidator.cs` declares `FullName`
at `:44` before `Cellphone` at `:48`; `UpdateOwnerCommandValidator.cs` declares `FullName` at `:18`
before `CellPhone` at `:22`; `UpdateReSellerCommandValidator.cs` declares `FullName` at `:28` before
`CellPhone` at `:32`. So a submit with BOTH `fullName` and `cellPhone` empty puts `FullName` at
`errors[0]` on all four paths, and any mapping that reads only the first element silently falls
through to the generic message — the exact failure this change exists to fix. The mapping MUST scan
every entry of `errors` for a known code, not just the first.

The match MUST also be case-insensitive (normalize each `code` before comparing — e.g. via
`.toLowerCase()`), not a hardcoded enumeration of exactly the two observed casings. The two real
casings (`"Cellphone"`, `"CellPhone"`) come from the DTOs cited above; case-insensitive comparison
is the general form of tolerating that split rather than special-casing it twice.

**Corrected scope** (2026-08-07, supersedes an earlier design draft): the message renders in the
existing top-of-form `role="alert"` banner (`validationError || serverError`,
`owner-create.tsx:124-128`, `owner-edit.tsx:275-279`, `reseller-create.tsx:95-99`,
`reseller-edit.tsx:176-180`) — the same element that already renders `OWNER.PHONE_FORMAT` today
(`owner-create.tsx:80-81`). No new per-field error slot is introduced in any of the four files.

## MODIFIED Requirements

### Requirement: FE-OC7 — Owner Create/Update Map The Phone-Required 400 Rejection To Dedicated Copy

`owner-create.tsx` and `owner-edit.tsx` MUST render a message distinct from `OWNER.ERROR` when
`createOwner`/`updateOwner` rejects with `response.status === 400` AND the `errors` array contains
an entry whose `code`, compared case-insensitively, is the phone-required property name. Because
create and update use different casing for the same field (DTO citations above: `Cellphone` on
create, `CellPhone` on update), the classification MUST recognize both casings as the phone-required
code via case-insensitive comparison — a case-sensitive match on only one casing silently fixes half
the surface.

The classification MUST scan the WHOLE `errors` array, not just `errors[0]`. Reading only the first
element is wrong: on all four paths (owner create/update, reseller create/update — see FE-OC8) the
`FullName` rule is declared before the `Cellphone`/`CellPhone` rule (evidence in this file's intro),
so a submit with both fields empty puts `FullName` at index 0 and the phone error later in the
array. A first-element-only read would silently fall through to the generic message for exactly the
co-failure case most likely in practice (an admin clearing multiple required fields at once).

This extends the existing classification pattern (FE-OC2/FE-OC3, this same capability), which today
keys only off `response.status` (409/403 for create, 404/403 for update). This requirement adds a
new axis: for a `400` rejection specifically, classification MUST also inspect the `errors` array,
because a `400 → generic message` mapping would be wrong — every backend validation failure of any
kind arrives as `400`, not just the phone-required one.

The mapped message MUST reach the form via the rejected-promise path (the `catch` block), not the
resolved `!res.succeeded` branch. `api-client.ts`'s `apiClient` does not override `validateStatus`
(`api-client.ts:20-26`), so axios rejects on every non-2xx response; the `!res.succeeded` branch
(`owner-create.tsx:97-100`, `owner-edit.tsx:219-222`) is unreachable for this failure and MUST NOT
be relied upon to carry the mapped message.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Create rejects on phone-required (create casing) | `createOwner` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'Cellphone', ... }` | The admin submits with an empty `cellPhone` | The banner (`role="alert"`) shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text |
| 2 | Update rejects on phone-required (update casing) | `updateOwner` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'CellPhone', ... }` | The admin saves with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text |
| 3 | Both casings map to the same rendered copy | Two separate rejections, one containing `{ code: 'Cellphone' }`, one containing `{ code: 'CellPhone' }` | Each is submitted through its respective page (create, update) | Both render the identical phone-required copy — the casing difference is invisible to the admin |
| 4 | Phone error found regardless of position in the array | `createOwner`/`updateOwner` rejects with `response.status === 400` and `response.data.errors === [{ code: 'FullName', ... }, { code: 'Cellphone'/'CellPhone', ... }]` (both fields empty, `FullName` occupies index 0) | The admin submits with both `fullName` and `cellPhone` empty | The banner shows the mapped phone-required copy — NOT `OWNER.ERROR`'s text; the classifier is not fooled by `FullName` sitting at `errors[0]` |
| 5 | An unrelated 400 still falls to the generic message | `createOwner`/`updateOwner` rejects with `response.status === 400` and no entry in `response.data.errors` has code `'Cellphone'`/`'CellPhone'` (e.g. only `{ code: 'FullName' }`) | The admin submits | The banner shows `OWNER.ERROR`'s text — never blank, never the phone-required copy, never the raw backend `description` |
| 6 | A 400 with no error body still falls to the generic message | `createOwner`/`updateOwner` rejects with `response.status === 400` and `response.data.errors` is empty or absent (e.g. `response.data` itself is `undefined`) | The admin submits | The banner shows `OWNER.ERROR`'s text. This is the exact shape the existing regression tests `owner-create.test.tsx:502-504` and `owner-edit.test.tsx:647` already pin (`{ response: { status: 400 } }`, no body) — those two tests stay green, unmodified, and now serve as the fallback's regression net |

### Requirement: FE-OC8 — Reseller Create/Update Gain Status/Code-Based Error Classification (Currently Absent)

`reseller-create.tsx` and `reseller-edit.tsx` currently have bare `catch { setServerError(...) }`
blocks (`reseller-create.tsx:81-82`, `reseller-edit.tsx:132-133`) that never inspect
`error.response.status` at all — every rejection, regardless of cause, renders `RESELLERS.ERROR`.
This requirement MUST add the same phone-required classification described in FE-OC7 to both
reseller forms, including its two corrections: the match scans the WHOLE `errors` array (not just
`errors[0]` — `CreateReSellerCommandValidator.cs` declares `FullName` at `:44` before `Cellphone` at
`:48`, and `UpdateReSellerCommandValidator.cs` declares `FullName` at `:28` before `CellPhone` at
`:32`, so the same co-failure ordering trap applies here) and the code comparison is
case-insensitive. A `400` rejection whose `errors` array contains an entry with code `'Cellphone'`
(create) or `'CellPhone'` (update) MUST render the mapped phone-required copy instead of
`RESELLERS.ERROR`.

No other status-based classification is added to the reseller forms by this requirement — 409/403/
404/network-failure handling stays exactly as it is today (all fall to `RESELLERS.ERROR`, unchanged
by this delta).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Reseller create rejects on phone-required | `createReseller` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'Cellphone', ... }` | The admin submits with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 2 | Reseller update rejects on phone-required | `updateReseller` rejects with `response.status === 400` and `response.data.errors` contains `{ code: 'CellPhone', ... }` | The admin saves with an empty `cellPhone` | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 3 | Phone error found regardless of position in the array | `createReseller`/`updateReseller` rejects with `response.status === 400` and `response.data.errors === [{ code: 'FullName', ... }, { code: 'Cellphone'/'CellPhone', ... }]` (both fields empty, `FullName` occupies index 0) | The admin submits with both `fullName` and `cellPhone` empty | The banner shows the mapped phone-required copy — NOT `RESELLERS.ERROR`'s text |
| 4 | An unrelated 400 still falls to the generic message | `createReseller`/`updateReseller` rejects with `response.status === 400` and no entry in `response.data.errors` has code `'Cellphone'`/`'CellPhone'` | The admin submits | The banner shows `RESELLERS.ERROR`'s text |
| 5 | Non-400 rejections are unaffected | `createReseller`/`updateReseller` rejects with `response.status` other than 400 (e.g. 500), or rejects with no `response` at all | The admin submits | The banner shows `RESELLERS.ERROR`'s text, exactly as today — this requirement does not touch that path |

## Unchanged By This Change

### Requirement: FE-OC9 — Every Other Error Sharing The Banner Keeps Its Current Message

The banner (`validationError || serverError`) already renders several other messages besides the
phone-required one: `OWNER.PASSWORD_POLICY`/`RESELLERS.PASSWORD_POLICY`,
`OWNER.PASSWORDS_MUST_MATCH`/`RESELLERS.PASSWORDS_MUST_MATCH`, and the existing FE-OC2/FE-OC3
classifications (`OWNER.DUPLICATE_LOGIN` on 409, `OWNER.FORBIDDEN` on 403,
`OWNER.NOT_FOUND` on 404). None of these MUST change as a result of this delta.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Password policy unaffected | The password fails `PASSWORD_REGEX` | The admin submits an owner/reseller create form | `OWNER.PASSWORD_POLICY`/`RESELLERS.PASSWORD_POLICY` is shown, unchanged |
| 2 | Passwords-must-match unaffected | `password !== confirmPassword` | The admin submits a create form | `OWNER.PASSWORDS_MUST_MATCH`/`RESELLERS.PASSWORDS_MUST_MATCH` is shown, unchanged |
| 3 | 409/403/404 classifications unaffected | `createOwner` rejects 409, or any of the four services reject 403, or `updateOwner` rejects 404 | The admin submits/saves | `OWNER.DUPLICATE_LOGIN`/`OWNER.FORBIDDEN`/`OWNER.NOT_FOUND` render exactly as FE-OC2/FE-OC3 already specify |
| 4 | The existing "unclassified 400" tests stay green, unmodified | The tests `owner-create.test.tsx:502-504` and `owner-edit.test.tsx:647` mock a rejection shaped `{ response: { status: 400 } }` with no body | Those tests run, unmodified, against the FE-OC7 implementation | They still assert `OWNER.ERROR`'s text and still pass — `response.data` is `undefined`, so no `errors` entry exists to match, and the fallback in FE-OC7 scenario 6 fires exactly as it already pins. These two tests are NOT touched by this change; they become the regression net for the fallback path |

### Requirement: FE-OC10 — No New Per-Field UI Is Introduced

The four admin forms keep exactly one error-rendering region each — the top-of-form
`role="alert"` banner. This delta MUST NOT add a `cellPhoneError`-style per-field slot (the pattern
that exists in `UserDetailsForm.tsx:40,109-110` is NOT copied here — that precedent belongs to a
different, unrelated form and was explicitly rejected as the direction for this change).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1 | Single alert region persists | Any of the scenarios in FE-OC7/FE-OC8 | The mapped message renders | Exactly one `role="alert"` element exists in the DOM for that form; no new element is added near the `cellPhone` input |
