# Delta for Admin Stores

## ADDED Requirements

### Requirement: Store List Surfaces succeeded:false via STORES.ERROR

`store-list.tsx`'s `loadStores` MUST treat a `succeeded: false` response from `storeHttpService.listStores()` the same as a thrown/rejected call: it MUST NOT call `setStores` with the response's `data` and MUST set the error state to `STORES.ERROR`, reusing the existing catch-branch idiom (the same idiom already used for `handleApprove`/`handleDisapprove` failures).

#### Scenario: List resolves with succeeded:false renders STORES.ERROR, not null stores
- GIVEN `storeHttpService.listStores()` resolves with `{ succeeded: false, data: null, errors: [...] }`
- WHEN `loadStores` runs
- THEN `stores` state is NOT set to `null`
- AND the error banner is set to `STORES.ERROR`

## Notes

- No change to the Approve/Disapprove confirmation flow, card-grid rendering, or lifecycle-state CSS specified in the existing `admin-stores` spec — only the list load's `succeeded: false` handling is added.
