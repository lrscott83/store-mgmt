# Delta for Management Users

## ADDED Requirements

### Requirement: Users List Surfaces succeeded:false via USERS.ERROR

`user-list.tsx`'s `loadUsers` uses `.then/.catch`, not try/catch — a `succeeded: false` response is a RESOLVED value inside `.then`, not a rejection caught by `.catch`. The `.then` callback MUST check `succeeded` before calling `setUsers`: on `succeeded: false` it MUST NOT call `setUsers` with the response's `data` and MUST set the error state to `USERS.ERROR`, the same message the `.catch` branch already uses for transport failures.

#### Scenario: getUsers resolves with succeeded:false renders USERS.ERROR, not null users
- GIVEN `userHttpService.getUsers()` resolves (does not reject) with `{ succeeded: false, data: null, errors: [...] }`
- WHEN the `.then` callback runs
- THEN `users` state is NOT set to `null`
- AND the error state is set to `USERS.ERROR`, the same copy used by the `.catch` branch

#### Scenario: getUsers resolves with succeeded:true still populates users as before
- GIVEN `userHttpService.getUsers()` resolves with `{ succeeded: true, data: User[], errors: [] }`
- WHEN the `.then` callback runs
- THEN `users` state is set to the resolved `data`
- AND the error state is cleared, unchanged from current behavior

## Notes

- This capability's error idiom differs from `admin-owners-resellers`/`admin-stores`: those use try/catch, `user-list.tsx` uses `.then/.catch`. The `succeeded: false` check belongs inside the existing `.then` callback, not a new catch branch — no new async pattern is introduced.
- `handleLifecycleAction`'s existing try/catch (`USERS.LIFECYCLE_ERROR`) is unaffected — out of scope for this delta.
