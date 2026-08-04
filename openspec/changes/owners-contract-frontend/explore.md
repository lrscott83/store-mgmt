# Explore: owners-contract-frontend

**Date**: 2026-08-03
**Scope**: `frontend-react/apps/web-store-pos/app/admin/owners/` — React only.
**Backend source of truth (already merged to main)**: `owners-create-endpoint-fixes`, `owners-update-endpoint-fixes`.
**Plans**: `docs/plans/2026-08-02-owners-create-frontend.md`, `docs/plans/owners-update-endpoint-fixes-frontend.md`.

## Current state

| File | Declares | Backend now returns |
|---|---|---|
| `owner-http-service.ts:39` | `createOwner → BaseResponseModel<string>` | `201 Created` + `ResponseResult<OwnerDto>` |
| `owner-http-service.ts:47` | `updateOwner → BaseResponseModel<boolean>` | `200` + `ResponseResult<OwnerDto>` |

`Owner` (`packages/domain/src/models/store.ts:63-75`) already matches the OwnerDto shape the backend
emits — `id`, `userId`, `fullName`, `cellPhone`, `email`, `description`, `guest`, `storeModules`,
`reSellerId`, `reSellerName`, `approved`, plus `isActive` from `AuditableBaseModel`. **No domain model
change is needed**; only the service's generic parameter is wrong.

## The defect is not where the plans imply

`apiClient` (`shared/lib/http/api-client.ts`) uses axios' default `validateStatus` — every non-2xx
**rejects**. Tracing each contract change against that:

| Contract change | Reaches the page as | Consequence today |
|---|---|---|
| 200 → **201** on create | resolved (2xx) | works; `succeeded` is true |
| `data: bool/string` → **OwnerDto** | resolved | no crash — neither page reads `res.data` |
| duplicate login 400 → **409** | **rejected** | falls to `catch` → generic `OWNER.ERROR` |
| auth 400 → **403** | **rejected** | falls to `catch` → generic `OWNER.ERROR` |
| not-found 400 → **404** (update) | **rejected** | falls to `catch` → generic `OWNER.ERROR` |

Two conclusions follow, and they change what this change is about:

1. **Nothing is crashing.** The wrong generics are a lie the compiler currently accepts, not a runtime
   break. `owner-create.tsx:101` navigates without reading `res.data`; `owner-edit.tsx:219`
   re-snapshots from local form state rather than from the response.
2. **The `!res.succeeded` branches are dead code.** `owner-create.tsx:96-99` and
   `owner-edit.tsx:213-216` read `res.errors[0]?.description` on a path the backend cannot produce
   for these endpoints — every business failure arrives as a rejected 4xx, so the `catch` runs
   instead and overwrites the specific server message with a generic one.

**The user-visible defect is therefore this**: a duplicate login shows "Error" instead of "that login
is taken". The typing mismatch is what let it hide.

## Constraints discovered

- **Do not touch the 401 branch.** `api-client.ts:82-84` deliberately does NOT log out on 401
  (offline-first: the local session owns its 35-day window). Any new status handling must leave it alone.
- **500 already shows a blocking Swal** (`api-client.ts:86-93`). New handling must not double-report it.
- **`BaseResponseModel<T>` is a discriminated union** (`packages/domain/src/models/base.ts:13-15`):
  `succeeded: false` forces `data: null`. Narrowing via `if (!res.succeeded)` is the established
  pattern and stays.
- **React only.** SDD init `#64` records the React 19 app as the SDD target; the legacy Angular app is
  explicitly not. The update plan mentions Angular, but it is out of scope here.
- **Navigation after create stays as-is** (`/management/stores/create`) — Angular parity. The new
  `data.id` does not justify redirecting somewhere else.

## Existing test coverage

- `owner-http-service.test.ts` — HTTP-4 (create) and HTTP-5 (update) assert URL + payload, plus
  reject-propagation cases at lines 255 and 270.
- `owner-create.test.tsx` — S-ADMIN-OWNERS-CREATE-7 covers the success path; a `mockRejectedValue`
  case covers the generic error.
- `owner-edit.test.tsx` — covers submit payload shape and the `!succeeded` branch.

All three suites mock `ownerHttpService`, so the response-shape change lands in the service tests and
the status handling lands in the route tests.

## Open question for the proposal

Does a duplicate login (409 / `Owner.DuplicateLogin`) get its own message, or does it reuse a generic
one? A dedicated i18n key is the only way the fix is visible to a user.
