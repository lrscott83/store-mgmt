# Delta for Admin Owners & Resellers

## MODIFIED Requirements

### Requirement: Owner Edit Load Classifies succeeded:false By actionCode (OWNER.NOT_FOUND / OWNER.FORBIDDEN / OWNER.ERROR)

`owner-edit.tsx`'s `getOwner(id)` load effect MUST treat a `succeeded: false` response the same
as its existing `.catch` branch — it MUST NOT populate form fields (`setOwner`/`setFullName`/etc.)
from the response's `data`. The resulting `loadError` key MUST now be derived from the envelope's
`actionCode` through the same classification map the `.catch` branch already uses
(`ownerErrorMessageId`): `actionCode: 404 -> OWNER.NOT_FOUND`, `actionCode: 403 -> OWNER.FORBIDDEN`,
any other `actionCode` — including `400`, `null`, or an unmapped value — falls through to
`OWNER.ERROR`, matching today's unconditional default. A real HTTP rejection (`.catch`,
`error.response.status`) keeps precedence over the envelope arm exactly as before; this
requirement only widens classification of the resolved-but-unsucceeded envelope, it does not
change rejection handling.

(Previously: any `succeeded: false` response, regardless of `actionCode`, unconditionally set
`loadError` to `OWNER.ERROR`.)

#### Scenario: getOwner resolves with succeeded:false, actionCode 404 renders OWNER.NOT_FOUND
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: 404, data: null, errors: [...] }`
- WHEN the load effect runs
- THEN none of the form-field setters is called with the response's data
- AND `loadError` is set to `OWNER.NOT_FOUND`, not `OWNER.ERROR`

#### Scenario: getOwner resolves with succeeded:false, actionCode 400 still renders OWNER.ERROR
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: 400, data: null, errors: [{ code: 'OwnerId', ... }] }`
- WHEN the load effect runs
- THEN none of the form-field setters is called with the response's data
- AND `loadError` is set to `OWNER.ERROR` — no key exists for 400 and none is invented

#### Scenario: getOwner resolves with succeeded:false, actionCode null renders OWNER.ERROR
- GIVEN `ownerHttpService.getOwner(id)` resolves with `{ succeeded: false, actionCode: null, data: null, errors: [...] }`
- WHEN the load effect runs
- THEN `loadError` is set to `OWNER.ERROR`, matching the existing catch-branch default

#### Scenario: A real HTTP rejection is classified through the same map
- GIVEN `ownerHttpService.getOwner(id)` rejects with `error.response.status === 404`
- WHEN the load effect's `.catch` branch runs
- THEN `loadError` is set to `OWNER.NOT_FOUND` via the rejection channel
- AND this is NEW behaviour, not preserved behaviour: today that `.catch` takes no parameter
  and renders `OWNER.ERROR` unconditionally (`owner-edit.tsx:166-168`). Only the SUBMIT path
  classifies rejections. This scenario must RED before it passes.

#### Scenario: The rejection channel keeps precedence over the envelope channel
- GIVEN an input that carries both `error.response.status` and a top-level `actionCode`
- WHEN the classifier runs
- THEN the key derived from `response.status` wins
- AND no real producer emits both shapes — an axios rejection has no top-level `actionCode`
  and a resolved envelope has no `response` — so this is pinned by a synthetic case, guarding
  the contract rather than an observed collision

## Notes — Scope Boundary (this delta only)

- The UPDATE submit branch (`owner-edit.tsx:214-217`, which surfaces
  `res.errors[0]?.description`) is unchanged by this delta — out of scope, tracked as a
  follow-up, not fixed here.
- `owner-create.tsx`'s FE-OC2 classification (409/403 via `error.response.status`) is unchanged:
  rejections keep precedence over any envelope arm, and existing FE-OC2 tests are the regression
  guard for that page.
- No new i18n keys, models, or mappers are introduced. `OWNER.NOT_FOUND` (`es.ts:766`),
  `OWNER.FORBIDDEN` (`es.ts:765`), and `BaseResponseModel.actionCode: number | null`
  (`base.ts:14-15`) already exist and are reused as-is.

## Merge Status

Merged into `openspec/specs/admin-owners-resellers/spec.md` at archive time (2026-08-04),
replacing the prior "Owner Edit Load Surfaces succeeded:false via OWNER.ERROR" requirement
(originating from the archived `owners-contract-frontend` change). All other requirements in
that capability (including FE-OC1..FE-OC6) were preserved unmodified.
