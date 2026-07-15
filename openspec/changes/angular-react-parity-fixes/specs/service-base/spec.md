# Delta for Service Base

## ADDED Requirements

### Requirement: Reactive List-State Consumers Are Already Satisfied By The Loader/useState Idiom

React MUST NOT introduce a shared reactive-state base (Zustand store, class, or otherwise) to
replace Angular's `BaseService` `items$`/`fetch()`/`isLoading$`/`patchState()` stream. All live
Angular consumers of these members are dropdown-datasource populators in 5 form components
(`edit-store`, `create-owner`, `edit-owner-details`, `create-reseller`, `edit-reseller-details`)
that call `service.fetch()` then read `service.items$` solely to populate a `<select>`/autocomplete
source — never to react to push updates from elsewhere. React's existing `useEffect` →
`listOwners()`/`listResellers()` → `useState` idiom (e.g. `owner-create.tsx:49`,
`edit-store.tsx:51`) already reproduces this one-shot-fetch-into-local-state behavior.

**Rules**: 5 (React idiom substitutes Angular's reactive-stream mechanic), 10 (call-site parity —
same trigger: populate a dropdown once per mount/permission-gate), 12 (no invention — building a
shared base/store here would add an abstraction Angular's own consumers never require beyond a
one-shot fetch).

#### Scenario: Dropdown-populating consumers need no reactive base
- GIVEN the 5 Angular form components that call `.fetch()` + read `.items$` for a dropdown
- WHEN their React equivalents are inspected
- THEN each uses `useEffect` to call the corresponding `listX()` HTTP method and store the result
  in local `useState`, with no shared reactive base class or store
- AND no `BaseService`-shaped abstraction exists in `packages/domain` or `apps/web-store-pos`

#### Scenario: A live cross-component consumer would reopen this decision
- GIVEN a grep of Angular source for `.items$`, `.fetch(`, `.isLoading$`, `.patchState(` consumers
- WHEN a consumer is found that reacts to push updates from OUTSIDE its own component (not a
  one-shot dropdown populate), i.e. more than the 5 known form components
- THEN this requirement is considered violated and the no-shared-base decision MUST be revisited
  before any further reliance on this requirement
