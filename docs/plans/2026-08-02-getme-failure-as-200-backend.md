# `/auth/me` Returns Failure As HTTP 200 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-08-02
Scope: `backend/` only. The frontend follow-up is recorded in Task 4 and must NOT be implemented here — it is required regardless of which option this plan takes, and the reason is spelled out there.
Related: `docs/plans/2026-07-30-offline-roster-billing-gate-backend-plan.md` (unimplemented, separate defect on the same controller family), `docs/plans/2026-08-02-offline-roster-dek-interop-backend-plan.md`.

**Goal:** Stop a deactivated user, whose token the backend has just blacklisted, from ending up inside the app marked as authenticated with an empty user object.

**Tech Stack:** .NET 8, MediatR 12, EF Core, xUnit + Moq + FluentAssertions (unit), Mvc.Testing (E2E). Solution: `backend/src/SMCA.sln`.

---

## The defect, stated precisely

`AuthController.GetMeAsync` (`SMCA.WebApi/Controllers/v1/AuthController.cs:78-81`):

```csharp
[ProducesResponseType(typeof(ResponseResult<CurrentUserDto>), StatusCodes.Status200OK)]
[ProducesResponseType(typeof(ResponseResult), StatusCodes.Status401Unauthorized)]
[ProducesResponseType(typeof(ResponseResult), StatusCodes.Status404NotFound)]
public async Task<IActionResult> GetMeAsync()
{
    return Ok(await Sender.Send(new GetMeQuery()));
}
```

The two lower attributes are documentation of a behaviour the method does not have. `Ok(...)` is unconditional.

`GetMeQuery.Handle` has three reachable failure paths (`GetMeQuery.cs:52-67`): no external id, user not found, and — the one that matters — `!user.IsActive`, which **blacklists the caller's token** and then returns `ResponseResult.Failure<CurrentUserDto>(UserErrors.AccountInactive, 404)`.

That 404 never reaches the wire. The client receives **HTTP 200** with `{ succeeded: false, data: null, ... }`.

### What the client does with it, traced

1. `axios` resolves — 200 is not an error.
2. `auth-http-service.ts:44-46` types the response as a hand-rolled `{ data: UserModel }` (not `BaseResponseModel<UserModel>`), so nothing guards `succeeded`. It returns `response.data.data` → **`null`, typed `UserModel`**.
3. `auth-store.ts:106` spreads it: `{ ...fresh, authToken, expiresIn, password: '' }`. **`{...null}` does not throw in JavaScript** — it spreads to `{}`.
4. `auth-store.ts:111-112` then persists that object over the good cached profile and sets `isAuthenticated: true`.

Net effect: **a deactivated user with a blacklisted token stays "logged in" with a user object that has no id, no login, no roles and no featureIds, and their cached profile is destroyed.** No error surfaces, because nothing threw — the surrounding `catch` never runs.

### This is systemic, not a slip

`rg 'return Ok\(await Sender\.Send'` over `SMCA.WebApi/Controllers/v1/` returns **66 occurrences across 13 controllers**. Only `AuthController` maps status at all (5 sites, added when the register/login contract was fixed). **Returning HTTP 200 for handler-level failures is the API's de-facto convention**, not an oversight in one action.

That is why this plan does not open with "change all 66". Deciding that is Task 1.

One consequence worth stating plainly: this convention is what makes the frontend's `BaseResponseModel<T>` discriminated union load-bearing rather than defensive. Failures genuinely do arrive as resolved 200s across most of this API. The 43 guards added by `response-envelope-nullability` are the mechanism that keeps them honest.

---

## Global Constraints

- **Do not "fix" all 66 actions as a reflex.** Flipping the whole API to status-mapped responses is a breaking change for every frontend call site: what resolves today would reject tomorrow, and each caller's error handling would have to be revisited. If that is the desired end state it deserves its own plan with a frontend migration; it is not a side effect of fixing `/auth/me`.
- **`ResponseResult.ActionCode` already carries the intended status.** `GetMeQuery` passes `(int)HttpStatusCode.NotFound`. Any mapping must read that rather than hardcode a second copy of the rule.
- **The token is already blacklisted before the failure returns.** Whatever status is chosen, the client must be able to tell "your session is over" from "the network hiccuped". That distinction is the whole point of this fix.
- **Do not change `GetMeQuery`'s logic.** The handler is correct: it detects the inactive account, blacklists, and reports failure. Only the transport is lying.

---

## File Structure

- Modify `SMCA.WebApi/Controllers/v1/AuthController.cs` — the `me` action.
- Possibly add `SMCA.WebApi/Extensions/ResponseResultExtensions.cs` (or equivalent) — a shared `ToActionResult()` if Task 1 chooses the reusable route.
- Modify `SMCA.WebApi.E2ETests/Authentication/` — an E2E proving the inactive-account path over real HTTP.
- Modify `Application.Tests/Features/Authentication/Queries/GetMe/` if handler-level assertions need extending.

---

### Task 1: Decide the scope, and write the decision down

- [ ] Choose between:
  - **(a) Fix `/auth/me` only.** Smallest blast radius. `/auth/me` is the endpoint whose failure means "this session is finished", so it is the one that cannot afford to look like success. Everything else keeps the 200 convention, which the frontend's discriminated union already handles.
  - **(b) Fix the auth-critical set.** `/auth/me` plus any endpoint whose failure invalidates the session. Enumerate it explicitly; do not leave "critical" to the reader.
  - **(c) Map all 66.** Only with a companion frontend migration plan and a coordinated release. Do not start this without one.
- [ ] Record the choice and its reasoning in the change's design artifact, including what the 200-for-failures convention now officially is for everything not covered.
- [ ] If (a) or (b): add a comment at `AuthController.GetMeAsync` explaining why this action maps status when its neighbours do not, so the asymmetry reads as deliberate.

**Recommendation:** (a). The defect is that a *terminated session* looks like a *successful fetch*. That is specific to `/auth/me`, and the frontend already has compile-enforced machinery for the general case.

---

### Task 2: Make `/auth/me` report the status it already documents

- [ ] Write the failing E2E first: seed an active user, authenticate, deactivate the user in the database, call `GET /api/v1/auth/me` with the still-valid token, and assert the response status is **404** (the code `GetMeQuery` already passes) and that the body is a `succeeded: false` envelope. Run it and watch it fail with `200`.
- [ ] Change the action to map `ResponseResult.ActionCode` onto the HTTP status rather than wrapping in `Ok(...)` unconditionally. Read the code from the result; do not re-derive it in the controller.
- [ ] Confirm the three `[ProducesResponseType]` attributes now describe real behaviour. If 401 is not actually reachable from this action, **delete that attribute** rather than leaving a second piece of documentation that lies.
- [ ] Re-run: E2E green.
- [ ] Add the sibling E2E for the happy path — an active user still gets **200** with `succeeded: true` and a populated `data` — so the fix cannot regress into "everything is 404".
- [ ] `dotnet test` on `Application.Tests` and `SMCA.WebApi.E2ETests`. Green.

---

### Task 3: Prove the blacklisting and the status agree

The inactive path does two things: it blacklists the token *and* reports failure. A client that receives a 404 and retries with the same token must not get a different answer.

- [ ] E2E: after the deactivation call above, call `/auth/me` a **second** time with the same token and assert the response is a rejection (401 from the blacklist middleware, or 404 again — assert whichever the middleware actually produces, and if the two disagree, say so in the report rather than picking the prettier one).
- [ ] `dotnet test`. Green.

---

### Task 4: Frontend follow-up — RECORD ONLY, do not implement here

**The backend fix alone does not close this.** It converts one silent failure into a different one.

Today: `getMe` resolves 200 → `null` spreads to `{}` → user is gutted, cached profile destroyed, still `isAuthenticated: true`.

After Task 2: `getMe` rejects with 404 → `auth-store.ts:113-116` catches it and returns `bestEffortUser`, because that catch is deliberately *offline-resilient* — its comment reads "retain the synchronously-hydrated user, never clear". So a deactivated user with a blacklisted token **keeps their cached profile and stays logged in**. Better than the gutted object, still wrong.

The frontend must therefore distinguish an authoritative rejection from a transport failure — the very distinction the current catch deliberately collapses, correctly, for the offline case.

- [ ] `auth-http-service.ts:44-46` — type the response as `BaseResponseModel<UserModel>` instead of the hand-rolled `{ data: UserModel }`, and guard `succeeded`. The hand-rolled shape is why this call site escaped the `response-envelope-nullability` sweep: that change discovered its 43 call sites by flipping the union and reading compiler errors, and an inline `{ data: X }` produces no error. Same fix applies to `roster-http-service.ts:12`, where the hole is latent — `ExportOfflineRosterQuery` has no failure path today, but the typing gives it nowhere to surface one.
- [ ] `auth-store.ts:102-117` — in the catch, separate "the request failed to reach anyone" (keep the cached user; the offline behaviour that exists today and must not regress) from "the server authoritatively said this session is over" (clear the session and send the user to `/login`). A 404/401 from `/auth/me` is the second kind.
- [ ] Regression test for the offline path: no network, cached profile retained, still authenticated. This is the behaviour the catch exists for and the one most likely to be broken by a careless fix.
- [ ] Regression test for the deactivated path: authoritative rejection, session cleared, cached profile not left behind.

---

## Verification

- `dotnet test` on `Application.Tests` and `SMCA.WebApi.E2ETests` — green.
- The inactive-account E2E observed failing on `200` before the fix, and passing on the documented status after. An unverified guard is not a guard.
- After Task 4 lands on the frontend: `pnpm test`, `pnpm typecheck`, `pnpm lint` from `frontend-react/` — green, with both new regression tests present.
