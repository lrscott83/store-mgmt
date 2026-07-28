# offline-device-provisioning Specification

## Purpose

The two surfaces that create and consume a roster bundle: the guest
`auth/provision` import flow (turns an unprovisioned device into a
provisioned one) and the admin "Export offline roster" action (produces the
encrypted bundle file). Neither surface performs authentication itself.

**Verification note**: the admin export action depends on a backend
endpoint (`GET /v1/storeusers/{storeId}/offline-roster`) that does not
exist yet (0% implemented, tracked in
`docs/plans/2026-07-28-backend-pending-work.md` §7a). The requirements
below for the export action are buildable and unit-testable against a
mocked transport; they are **not verifiable end-to-end** until the backend
ships. No scenario in this spec presumes a live endpoint response.

## Requirements

### Requirement: Guest provisioning route imports a roster bundle
The `auth/provision` route MUST be reachable without an authenticated
session (a fresh device is not logged in). Given a bundle file, a storeId,
and a master password, it MUST decrypt and import the bundle, after which
`isRosterProvisioned()` becomes true on that device.

#### Scenario: Successful provisioning
- GIVEN a valid encrypted bundle file, the correct storeId, and the correct master password
- WHEN the user submits the provisioning form
- THEN the roster is imported and persisted
- AND `isRosterProvisioned()` subsequently returns true on this device

### Requirement: Provisioning surfaces a distinct message per failure mode
The provisioning route MUST show a distinct, user-facing message for each
import failure: wrong master password (`WrongPasswordError`), a
structurally invalid file (`CorruptFileError`), an already-expired bundle
(`ExpiredBundleError`), and a replayed/older bundle (`ReplayBundleError`).
None of these failures MUST import or persist a roster.

#### Scenario: Wrong master password is rejected with its own message
- GIVEN a valid bundle file and an incorrect master password
- WHEN the user submits the provisioning form
- THEN a wrong-password-specific message is shown
- AND no roster is imported

#### Scenario: Replayed bundle is rejected with its own message
- GIVEN a bundle already imported on this device
- WHEN the same bundle is submitted again
- THEN a replay-specific message is shown
- AND the previously stored roster is unchanged

### Requirement: Admin export action produces a downloadable encrypted bundle
An authorized admin, while online, MUST be able to trigger an export action
on the user-management list that: retrieves the store's roster payload via
`rosterHttpService`, re-encrypts it into the same bundle container format
as import expects (master + storeId password), and downloads it as a file.
The action MUST be disabled while the device is offline, since retrieval
requires the API.

#### Scenario: Export disabled while offline
- GIVEN the admin's device has no connectivity
- WHEN the user-management list renders
- THEN the "Export offline roster" action is disabled

#### Scenario: Export calls the roster endpoint with the current store (unit-level only)
- GIVEN a mocked transport standing in for the backend endpoint
- WHEN the admin triggers the export action for the current store
- THEN `rosterHttpService.getOfflineRoster` is called with that store's id
- AND the returned payload is serialized into the same bundle format `offline-device-provisioning` can import
- NOTE: this scenario is verified against a mock only; end-to-end behavior against the real backend is unverifiable until §7a ships.
