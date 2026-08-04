# Proposal: owners-contract-frontend

**Date**: 2026-08-03
**Status**: draft
**Depends on**: `owners-create-endpoint-fixes`, `owners-update-endpoint-fixes` (both merged to `main`)

## Why

The backend changed the Owners create and update contracts and shipped them to `main`. The React
client was never updated. Two consequences, in order of what a user actually feels:

1. **A duplicate login shows "Ocurrió un error. Intentá de nuevo."** The backend now reports it as
   `409` with `Owner.DuplicateLogin`, which axios rejects, so `owner-create.tsx:102` catches it and
   replaces the specific cause with a generic message. The same happens for `403` (no permission) and,
   on update, `404` (owner no longer exists). Three distinct, actionable failures render identically.
2. **`owner-http-service.ts` declares response types the server does not send** — `createOwner` says
   `BaseResponseModel<string>` where an `OwnerDto` arrives, `updateOwner` says
   `BaseResponseModel<boolean>`. Nothing crashes today, because neither page reads `res.data`. That is
   precisely the problem: the type is a lie the compiler accepts, and it is what let (1) go unnoticed.

## What changes

**1 — Tell the truth about the response types.**
`createOwner` and `updateOwner` return `BaseResponseModel<Owner>`. The domain `Owner`
(`packages/domain/src/models/store.ts:63-75`) already matches the backend's `OwnerDto` field for
field, so no domain model changes.

**2 — Surface business failures with their own messages.**
Both pages classify the rejected error by HTTP status and pick a dedicated i18n key, falling back to
`OWNER.ERROR` for anything unclassified:

| Status | Where | New key |
|---|---|---|
| 409 | create | `OWNER.DUPLICATE_LOGIN` — "Ese login ya está en uso. Elegí otro." |
| 403 | create, update | `OWNER.FORBIDDEN` — "No tenés permiso para esta acción." |
| 404 | update | `OWNER.NOT_FOUND` — "El propietario no existe o fue eliminado." |
| anything else | both | `OWNER.ERROR` (unchanged) |

**3 — Keep the `!res.succeeded` guards; add classification alongside them.**
`owner-create.tsx:96-99` and `owner-edit.tsx:213-216` read `res.errors[0]?.description` on a path no
current handler reaches — both throw `ApiException`, so failures arrive rejected. But
`OwnersController.cs:71` still has a live `: Ok(result)` branch that would return `succeeded: false`
on HTTP 200. The guards therefore stay: deleting them would make the client's correctness depend on a
server implementation detail. The classification in (2) is additive, and both paths end at the same
`setServerError`. (Amends the explore note that called these branches dead.)

**4 — Use the returned `OwnerDto` on update.**
`owner-edit.tsx:219` currently re-snapshots from local form state. With the server echoing the
persisted entity, the snapshot comes from `res.data`, so the dirty check compares against what was
actually saved rather than against what was typed.

## Out of scope

- **The Angular client.** SDD init `#64` records the React app as the SDD target. The update plan
  mentions Angular; that is a separate decision, not this change.
- **Backend.** All three Owners backend changes are merged; nothing here touches `backend/`.
- **Navigation after create.** Stays at `/management/stores/create` (Angular parity). The new
  `data.id` does not justify a different destination.
- **The `Location` header.** Optional per the plan, and the id already arrives in the body.
- **`owners-getall` and `owners-getbyid`.** GetAll requires no frontend action by its own plan.
  GetById's envelope-404 is already absorbed by the existing `!res.succeeded` check in
  `owner-edit.tsx:148` — that one is a *resolved* 200 envelope, unlike the rejects handled here, so it
  stays as it is.

## Risks

| Risk | Mitigation |
|---|---|
| Status classification swallows the 500 blocking Swal or changes the 401 offline-first behaviour | Classify only 403/404/409 explicitly; everything else keeps today's path untouched. Regression test asserts a 500 still reaches the interceptor and a 401 does not log out. |
| `isNetworkError` rejects get misread as business failures | They carry no `response`, so they fall to the `OWNER.ERROR` default. Covered by a test. |
| Widening the generic to `Owner` breaks other call sites | `createOwner`/`updateOwner` have exactly two call sites each (the two route files) plus their tests; `tsc` proves the rest. |

## Verification

`pnpm typecheck`, `pnpm test`, `pnpm lint` from `frontend-react/` — all green, with new tests for each
of the three classified statuses and for the two paths that must NOT change (500, 401).
