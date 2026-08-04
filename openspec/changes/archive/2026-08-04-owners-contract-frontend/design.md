# Design: owners-contract-frontend

**Date**: 2026-08-03
**Spec**: `specs/admin-owners-resellers/spec.md`

## How failures actually arrive — verified against backend source

This is the fact the whole design rests on, so it is recorded with its evidence rather than assumed.

| Endpoint | Failure | Backend mechanism | Reaches the client as |
|---|---|---|---|
| POST create | unauthorized actor | `throw new ApiException(..., Forbidden)` — `CreateOwnerCommand.cs:54` | **rejected** 403 |
| POST create | duplicate login | `throw new ApiException(..., Conflict)` — `CreateOwnerCommand.cs:69` | **rejected** 409 |
| POST create | reseller missing | `throw new ApiException(..., BadRequest)` — `CreateOwnerCommand.cs:82` | **rejected** 400 |
| POST create | handler returns a failure envelope | `result.Succeeded ? CreatedAtAction(...) : Ok(result)` — `OwnersController.cs:69-71` | **resolved** 200, `succeeded: false` |
| PUT update | owner not found | `throw new ApiException(..., NotFound)` — `UpdateOwnerCommand.cs:64,70` | **rejected** 404 |
| PUT update | reseller not found | `throw new ApiException(..., BadRequest)` — `UpdateOwnerCommand.cs:93` | **rejected** 400 |

Both shapes are real. The reject path carries every failure the handlers actually produce today; the
resolved-envelope path is a live branch in the create controller that no current handler reaches.

## Decisions

### D1 — Classify on a structural read of `error.response.status`, not `axios.isAxiosError`

The two page components do not import axios today and will not start. The classifier reads
`(error as { response?: { status?: number } }).response?.status`, which is `undefined` for network
failures and client timeouts — exactly the cases that must fall through to `OWNER.ERROR`.

*Rejected*: importing `axios` into the presentation layer to call `isAxiosError`. It buys a type guard
we do not need and couples two route components to the HTTP library.

### D2 — One local helper, an explicit map per call site

`app/admin/owners/lib/owner-error-message.ts`:

```ts
export function ownerErrorMessageId(
  error: unknown,
  byStatus: Record<number, string>
): string {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return (status !== undefined && byStatus[status]) || 'OWNER.ERROR';
}
```

Create passes `{ 409: 'OWNER.DUPLICATE_LOGIN', 403: 'OWNER.FORBIDDEN' }`; edit passes
`{ 404: 'OWNER.NOT_FOUND', 403: 'OWNER.FORBIDDEN' }`. The map is at the call site because the two
pages genuinely disagree about which statuses are meaningful — 409 is impossible on update, 404 is
impossible on create. Hiding that behind one shared table would state something untrue.

*Rejected*: a generic HTTP-error-to-message utility in `shared/lib/http`. Nothing outside
`admin/owners` needs it, and inventing a global abstraction for two call sites is the kind of thing
this codebase's rule 12 exists to prevent. If a third module ever needs it, promoting it is a
mechanical move.

### D3 — Keep the `!res.succeeded` guard; the classification is additive

`OwnersController.cs:71` can return `Ok(result)` with `succeeded: false`. No handler reaches that
branch today, but it is compiled, reachable code on the server. Removing the client guard would make
correctness depend on a backend implementation detail that could change without notice.

This amends proposal item 3: the guard stays, and the `catch` gains classification. Both paths end at
the same `setServerError`, so a user sees one message either way.

### D4 — On update success, rehydrate BOTH the form fields and the snapshot from `res.data`

Snapshotting from the response while leaving the form on locally typed values would mark the form
dirty the instant the server normalises anything. The page therefore re-seeds its fields from
`res.data` and then calls the existing `makeSnapshot(res.data)` — the helper already accepts an
`Owner` (`owner-edit.tsx:39-48`), so no new mapping is written.

`setOwner(res.data)` is included so the non-SuperAdmin fallbacks at `owner-edit.tsx:208,210`
(`owner?.isActive`, `owner?.reSellerId`) read the persisted entity on a second save rather than the
one loaded at mount.

### D5 — `api-client.ts` is not touched

Its 401 (offline-first, no logout) and 500 (blocking dialog) behaviour is spec'd elsewhere and
deliberately divergent from Angular. This change classifies inside the two pages only. A 500 still
raises the interceptor's dialog and additionally sets `OWNER.ERROR` inline — one dialog, one inline
message, no duplication of the dialog itself.

### D6 — Test order (strict TDD)

Each step is red before it is green:

1. `owner-http-service.test.ts` — assert `res.data` is an `Owner` for create and update (fails on the
   `string`/`boolean` generics).
2. `owner-error-message.test.ts` — the helper: mapped status, unmapped status, no `response`,
   `undefined` error.
3. `owner-create.test.tsx` — 409, 403, 400, network, success-unchanged.
4. `owner-edit.test.tsx` — 404, 403, 400, network, snapshot-from-response, stays-on-page.
5. `es.ts` keys, driven by the route tests asserting rendered Spanish copy.

## Files

| File | Change |
|---|---|
| `admin/owners/lib/services/owner-http-service.ts` | generics → `BaseResponseModel<Owner>` (2 methods) |
| `admin/owners/lib/owner-error-message.ts` | **new** — the classifier |
| `admin/owners/routes/owner-create.tsx` | classify in `catch`; keep the `!succeeded` guard |
| `admin/owners/routes/owner-edit.tsx` | classify in `catch`; rehydrate form + snapshot from `res.data` |
| `shared/lib/i18n/es.ts` | 3 new `OWNER.*` keys |
| 4 test files | per D6 |

## Verification

`pnpm typecheck`, `pnpm test`, `pnpm lint` from `frontend-react/`. The 500 and 401 regression
scenarios (FE-OC6) are the ones to watch — they are what a status-classifying change is most likely to
break silently.
