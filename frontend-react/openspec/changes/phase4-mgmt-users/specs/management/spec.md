# Delta for management (phase4-mgmt-users)

(Previously: management spec contained only Stores sub-domain requirements from phase4-mgmt-stores)

---

## ADDED Requirements

### Requirement: User Route Registration

The system MUST register three user routes in `app/routes.ts`:
`/management/users` → `UserListPage`,
`/management/users/create` → `UserCreatePage`,
`/management/users/:id/edit` → `UserEditPage`.
Each route module MUST export a named `loader` bound to `adminFeatureLoader([EFeatures.Users])` and a default page component.

#### Scenario: Routes registered and accessible

- GIVEN an authorised user (super-admin or owner-admin with EFeatures.Users=72)
- WHEN they navigate to `/management/users`, `/management/users/create`, or `/management/users/1/edit`
- THEN the corresponding container renders; no 404 or blank page occurs.

#### Scenario: Unauthorised user blocked

- GIVEN a user lacking the required role or feature
- WHEN they navigate to any user route
- THEN `adminFeatureLoader` redirects before the container renders.

---

### Requirement: userHttpService Contracts

The system MUST expose a `userHttpService` singleton at
`app/management/users/lib/services/user-http-service.ts` with functions for all Users endpoint
contracts: `listAll`, `getById`, `create`, `updateDetails`, `activate`, `deactivate`,
`changePassword`. All calls MUST go through the shared `apiClient`.

#### Scenario: List call

- GIVEN a call to `userHttpService.listAll()`
- WHEN it executes
- THEN it calls `GET /v1/storeusers/list/true` and returns `BaseResponseModel<StoreUser[]>`.

#### Scenario: Create call with roleIds

- GIVEN a call to `userHttpService.create(payload)`
- WHEN it executes
- THEN `POST /v1/storeusers` is called with `roleIds: [3]` in the request body.

#### Scenario: changePassword requires oldPassword

- GIVEN a call to `userHttpService.changePassword(id, { oldPassword, newPassword })`
- WHEN it executes
- THEN `POST /v1/users/change-password/:id` is called with both `oldPassword` and `newPassword` in the body; the call is never made without `oldPassword`.

---

### Requirement: User List Container

The system MUST provide a list container that fetches `StoreUser[]`, writes through to cache,
renders `UserList` (presentational), supports activate/deactivate lifecycle actions with refetch,
and falls back to cache in degraded mode when offline.

#### Scenario: Online fetch and cache write

- GIVEN an online authorised user mounting the list page
- WHEN `listAll()` succeeds
- THEN `UserList` renders the users AND the result is written to `BaseRepository<StoreUser>` cache.

#### Scenario: Offline degraded mode

- GIVEN an offline authorised user AND a populated cache
- WHEN the container mounts
- THEN `UserList` renders cached data with a degraded-mode indicator.

#### Scenario: Lifecycle action online

- GIVEN an online authorised user who clicks Deactivate on user id 7
- WHEN the callback fires
- THEN `DELETE /v1/users/7` is called; on success the list re-fetches.

#### Scenario: Lifecycle action offline

- GIVEN an offline authorised user
- WHEN they attempt any lifecycle action
- THEN the action is blocked and an offline error is visible; no HTTP call is made.

---

### Requirement: User Create Container (storeId guard)

The system MUST redirect to `/management/stores` when no `storeId` is resolvable from route
params or `selectedStoreId`. When `storeId` is present, submit MUST call `create(payload)` with
`roleIds: [3]`. On success navigate to `/management/users`.

#### Scenario: Missing storeId redirect

- GIVEN no `:storeId` param AND no `selectedStoreId` in auth store
- WHEN the create container mounts
- THEN the user is redirected to `/management/stores` without rendering the form.

#### Scenario: Successful creation

- GIVEN a valid storeId AND all required fields filled with a compliant password
- WHEN the user submits
- THEN `POST /v1/storeusers` is called with `roleIds: [3]`; on success navigation goes to `/management/users`.

#### Scenario: Create offline blocked

- GIVEN the user is offline when the form is displayed or goes offline
- WHEN the form submit is attempted
- THEN the submit button is disabled and an offline notice is shown.

---

### Requirement: User Edit Container (two stacked sub-forms)

The system MUST render one edit page with two independent sub-forms: `UserDetailsForm` and
`UserCredentialsForm`, each with its own submit. Details submit calls `PUT /v1/users/:id`;
credentials submit calls `POST /v1/users/change-password/:id` with `oldPassword` required.

#### Scenario: Details update

- GIVEN an online authorised user on the edit page who modifies a field and submits details
- WHEN the details form is submitted
- THEN `PUT /v1/users/:id` is called; an inline success message is shown; no page navigation required.

#### Scenario: Password change

- GIVEN an online authorised user on the edit page who supplies valid oldPassword and newPassword
- WHEN the credentials form is submitted
- THEN `POST /v1/users/change-password/:id` is called; on success the credentials fields are cleared.

#### Scenario: isActive conditional rendering

- GIVEN a super-admin or owner-admin on the edit page
- WHEN `UserDetailsForm` renders
- THEN the `isActive` toggle is visible.
- AND GIVEN a user without super-admin or owner-admin role
- THEN the `isActive` toggle is NOT rendered.

---

### Requirement: Four Presentational Components

The system MUST provide four pure presentational components — `UserList`, `UserCreateForm`,
`UserDetailsForm`, `UserCredentialsForm` — at `app/management/users/components/`. None MUST import
HTTP services, router hooks, or `useOnlineStatus`. Create and details forms MUST NOT share shape.

#### Scenario: Presentational isolation

- GIVEN any of the four components rendered in isolation (without a real router or HTTP layer)
- WHEN rendered in tests with mock props
- THEN they render without throwing and without requiring a real router or network.

#### Scenario: Offline prop disables submit

- GIVEN any form component passed `isOnline = false`
- WHEN it renders
- THEN its submit button is disabled and `USERS.OFFLINE_NOTICE` is visible.

---

### Requirement: Credentials — oldPassword Always Required

The system MUST NOT allow a credentials form submission without `oldPassword`. No admin-bypass
path exists. The change-login field MUST NOT appear anywhere in the UI.

#### Scenario: Empty oldPassword blocked

- GIVEN the credentials form with `oldPassword` left empty
- WHEN the user attempts to submit
- THEN client-side validation fires and the form does not submit.

#### Scenario: No change-login field

- GIVEN the create or edit page rendered for any role
- WHEN the page renders
- THEN no field labelled "new login", "change login", or similar is present.

---

### Requirement: Users Offline Behaviour

The system MUST implement the same offline policy as the Stores sub-domain: write-through cache
on successful list fetch, cache fallback on failure, all writes blocked with visible error, no
offline queue, and a reactive gate (disable/re-enable on connectivity change without reload).

#### Scenario: Write-through cache on success

- GIVEN an online user and a successful `listAll()` response
- WHEN the container processes the response
- THEN the result is written to `BaseRepository<StoreUser>` before rendering.

#### Scenario: Reactive offline gate

- GIVEN a user on a create or edit form
- WHEN the device goes offline
- THEN submit button disables without a page reload; connectivity restoration re-enables it without a reload.

---

### Requirement: USERS.* i18n Keys

The system MUST add the 27 minimum `USERS.*` keys to `es.ts`. All user-visible copy in the Users
slice MUST originate from `es.ts` message keys via `useIntl`/`FormattedMessage`.

#### Scenario: No hardcoded strings

- GIVEN any Users container or component rendered inside an `IntlProvider`
- THEN no raw Spanish or English string literals appear in the rendered output.

---

### Requirement: Users Test Suite

The system MUST have a smoke-test suite at
`app/management/users/routes/__tests__/user-routes.test.tsx` covering list (5 cases), create
(5 cases including storeId-guard), edit (6 cases — two sub-form paths), and
`userHttpService` unit tests (8 cases). `useOnlineStatus` MUST be mockable in tests.

#### Scenario: Test suite passes clean

- GIVEN the full implementation in place
- WHEN `vitest` runs the user routes test suite
- THEN all tests pass with no skipped or failing cases.

#### Scenario: useOnlineStatus mocked

- GIVEN a test that simulates offline state
- WHEN `useOnlineStatus` is mocked to return `false`
- THEN the component under test enters offline mode without relying on `navigator.onLine`.
