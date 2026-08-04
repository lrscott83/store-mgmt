# Proposal: Owner load reads `actionCode` off the failure envelope

## Intent

Opening `/admin/owners/edit/{missing-id}` says "Ocurrió un error" when the truth is "El propietario no existe". The message already exists (`OWNER.NOT_FOUND`, `es.ts:766`); nothing routes to it on the load path.

Cause: the API reports not-found as **HTTP 200 with `succeeded:false, actionCode:404`** (`GetOwnerByIdQuery.cs:34` + unconditional `Ok(...)` at `OwnersController.cs:51`). React classifies by HTTP status only (`owner-error-message.ts:10`), so `owner-edit.tsx:149-152` falls through to `OWNER.ERROR` and the `404 -> OWNER.NOT_FOUND` map at `:237` (submit path) is never reached on load.

200-with-envelope is the API's **documented convention** (66 `Ok(await Sender.Send(...))` sites, 13 controllers), not a defect. The frontend adapts; the backend is not touched.

## Scope

### In Scope
- Give `ownerErrorMessageId` a second classification channel: envelope `actionCode` when `succeeded === false`, alongside today's `error.response.status`. One key map, both channels.
- Wire the `owner-edit.tsx` load path (`:144-169`) — envelope arm and `.catch` arm — to that map: `404 -> OWNER.NOT_FOUND`, `403 -> OWNER.FORBIDDEN`, everything else `OWNER.ERROR`.
- Test coverage for the envelope-404 load path in `owner-edit.test.tsx`.

### Out of Scope
- Any `backend/` change. Also: no `apiClient` interceptor change — FE-OC6's 401/500 paths stay untouched.
- The **update** submit branch (`owner-edit.tsx:214-217`), which surfaces `res.errors[0]?.description`. Same envelope shape, different ratified idiom (FE-OC3). Recorded as a follow-up, not fixed here.
- `owner-create.tsx` — `CreateOwnerAsync` maps real status codes, so 409/403 already arrive as HTTP rejections.
- New i18n keys, new models, new mappers. `BaseResponseModel` already declares `actionCode: number | null` (`base.ts:14-15`); both message keys already exist.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `admin-owners-resellers`: the requirement *"Owner Edit Load Surfaces succeeded:false via OWNER.ERROR"* becomes conditional — `OWNER.ERROR` stays the fallback, but `actionCode` 404/403 now resolve to their specific keys.

## Approach

Extend the existing helper rather than add a parallel one. `ownerErrorMessageId(input, byStatus)` derives a status from either shape — `input.response.status` (rejection) or `input.actionCode` when `succeeded === false` (envelope) — and indexes the same map. Structural reads, no axios import, preserving the D1/D2 idiom the helper was built with.

Call sites then pass one map per page instead of two divergent branches.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.../owners/lib/owner-error-message.ts` | Modified | Envelope channel added |
| `.../owners/routes/owner-edit.tsx` | Modified | Load path uses the map (both arms) |
| `.../owners/routes/__tests__/owner-edit.test.tsx` | Modified | Envelope-404 + 403 coverage |
| `openspec/specs/admin-owners-resellers/spec.md` | Modified | Delta on the load requirement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Widening the helper regresses create's 409/403 classification | Low | Rejections keep `response.status` precedence; existing FE-OC2 tests are the guard |
| An envelope arrives with `actionCode: null` or 400 (`Guid.Empty`) | Med | Unmapped/`null` falls through to `OWNER.ERROR` — explicit test |
| Spec drift vs. archived `owners-contract-frontend` | Low | Delta amends FE-OC-era text instead of restating it |

## Rollback Plan

Single-concern commits on `feat/owners-getbyid-envelope-404`. Revert the helper commit and the load-path commit; nothing else imports the new channel. No migration, no persisted state, no backend coupling.

## Dependencies

None. Backend is already on `main` and is not modified.

## Success Criteria

- [ ] Load of a non-existent owner renders `OWNER.NOT_FOUND`, not `OWNER.ERROR`
- [ ] Load with HTTP 403 renders `OWNER.FORBIDDEN`
- [ ] `actionCode` 400 / `null` / absent still renders `OWNER.ERROR`
- [ ] `owner-create.tsx` 409/403 behaviour unchanged (existing tests green)
- [ ] `pnpm typecheck` exit 0; full suite green via `npx turbo run test --force`
