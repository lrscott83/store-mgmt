# offline-auth-mode Specification

## Purpose

The governing rule of the whole change: `isRosterProvisioned()` decides
whether a login attempt is authenticated offline (against the roster) or
online (exactly as today) — before any credential is evaluated. Also owns
offline credential verification, the roster-user → `UserModel` mapping, and
error-id mapping onto the messages the online path already uses.

```
isRosterProvisioned()  →  OFFLINE authentication against the roster file,
                          regardless of connectivity
otherwise               →  ONLINE authentication, EXACTLY as today
```

## Requirements

### Requirement: Mode switch, not a fallback
The device MUST authenticate offline whenever `isRosterProvisioned()` is
true, independent of `ConnectivityService.isOnline()`. Nothing in the login
path MUST branch on connectivity to choose between offline and online
authentication; connectivity MUST continue to matter only inside the
online branch, as it does today.

#### Scenario: Provisioned device with working internet still authenticates offline
- GIVEN a device has a valid, non-expired roster
- AND `ConnectivityService.isOnline()` returns true
- WHEN the user submits valid roster credentials
- THEN authentication proceeds via the roster
- AND `POST /login` (the online action) is never called

### Requirement: An unprovisioned device is byte-for-byte unchanged
This is the headline invariant of the change. On a device with no
provisioned roster, login behavior MUST be identical to the behavior before
this change existed: online submission calls only the online `login`
action; offline submission (no connectivity) renders the existing
`AUTH.OFFLINE_LOGIN` banner and calls neither the online `login` action nor
`loginOffline`.

#### Scenario: Unprovisioned + online submits online only
- GIVEN no roster is provisioned on this device
- AND `ConnectivityService.isOnline()` returns true
- WHEN the user submits the login form
- THEN the online `login` action is called
- AND `loginOffline` is never called

#### Scenario: Unprovisioned + offline shows the existing banner only
- GIVEN no roster is provisioned on this device
- AND `ConnectivityService.isOnline()` returns false
- WHEN the user submits the login form
- THEN the `AUTH.OFFLINE_LOGIN` banner renders
- AND neither the online `login` action nor `loginOffline` is called

### Requirement: An expired bundle falls back to online auth
An expired roster MUST make `isRosterProvisioned()` false, so login on that
device MUST proceed through the online path (subject to connectivity, as
in the unprovisioned case) rather than being blocked or locked out.

#### Scenario: Expired roster does not block login
- GIVEN a device's stored roster has an `expiresAt` in the past
- AND the device has internet connectivity
- WHEN the user submits the login form
- THEN authentication proceeds through the online `login` action
- AND the user is not locked out or shown a roster-specific error

### Requirement: A user absent from the roster is rejected like a wrong password
On a provisioned device, a login attempt for a `login` value not present in
the roster MUST be rejected with the same message id as an incorrect
password (`AUTH.INVALID_CREDENTIALS`) — indistinguishable to the user.

#### Scenario: Unknown user on a provisioned device
- GIVEN a device has a valid roster that does not contain login `"ghost"`
- WHEN the user submits `"ghost"` with any password
- THEN the form error is `AUTH.INVALID_CREDENTIALS`
- AND no navigation occurs

### Requirement: Offline error mapping onto existing message ids
Offline authentication failures MUST map onto message ids already used by
the online path: `OfflineInvalidPasswordError` and
`OfflineUserNotFoundError` MUST map to `AUTH.INVALID_CREDENTIALS`;
`OfflineUserInactiveError` MUST map to `AUTH.ACCOUNT_INACTIVE`; any other
offline error (including `NoRosterError`) MUST map to `AUTH.SERVER_ERROR`.
No new message ids MUST be introduced for these cases.

#### Scenario: Wrong password maps to invalid credentials
- GIVEN a provisioned device and a roster user with a known password
- WHEN the user submits an incorrect password
- THEN the form error is `AUTH.INVALID_CREDENTIALS`

#### Scenario: Inactive roster user is rejected distinctly
- GIVEN a provisioned device and a roster user marked inactive
- WHEN that user submits correct credentials
- THEN the form error is `AUTH.ACCOUNT_INACTIVE`

### Requirement: A roster user with a null verifier degrades to OfflineVerifierError, never wrong password

When a roster user's `verifier` field is `null` (a distinct, well-typed
value — not merely absent or malformed), attempting offline login for that
user MUST throw `OfflineVerifierError`, which maps to `AUTH.SERVER_ERROR`
per the "Offline error mapping" requirement above. It MUST NOT fall
through to `verifyOfflinePassword` and MUST NOT produce
`AUTH.INVALID_CREDENTIALS` ("wrong password").

This does not change the mapping table itself — `OfflineVerifierError`
already fell under "any other offline error" → `AUTH.SERVER_ERROR`. It adds
the scenario that actually exercises a `null` verifier reaching that
mapping, previously unreachable because the backend's `Verifier` field was
never nullable (see `offline-auth` R5).

#### Scenario: Null verifier surfaces offline-unavailable, not wrong-password
- GIVEN a provisioned device whose roster contains a user with `verifier: null`
- WHEN that user submits any password, correct or incorrect
- THEN the form error is `AUTH.SERVER_ERROR`
- AND `AUTH.INVALID_CREDENTIALS` is never shown for this case

#### Scenario: A present, well-typed verifier still distinguishes wrong password normally
- GIVEN a provisioned device whose roster contains a user with a non-null `verifier`
- WHEN that user submits an incorrect password
- THEN the form error is `AUTH.INVALID_CREDENTIALS` (existing behavior, unchanged)

#### Scenario: Type-guard distinguishes null from a stale all-empty verifier
- GIVEN the roster type contract requires `verifier: OfflineVerifier | null` (no longer a
  non-nullable object that could default to `{ hash: "", salt: "", iterations: 0 }`)
- WHEN a user's verifier is `null` on the wire
- THEN the existing `typeof` guard in `offline-auth-service.ts` correctly identifies it as
  missing and throws `OfflineVerifierError` before ever calling `verifyOfflinePassword`

### Requirement: Offline-hydrated UserModel carries no-billing-data defaults
Because `UserModel` requires `paymentStatus`, `isInTrial`, and
`paymentDueDate`, and the roster carries no billing snapshot, a successful
offline authentication MUST map the resulting `UserModel` with
`paymentStatus: 'NoAplica'`, `isInTrial: false`, `paymentDueDate: null`.
Accepted consequence: a store whose plan is actually expired or trialing
shows no payment warning while operating offline; this is a documented
trade-off, not a defect.

#### Scenario: Offline login produces a complete UserModel with silent billing
- GIVEN a provisioned device and valid roster credentials
- WHEN offline authentication succeeds
- THEN the resulting `UserModel` has `paymentStatus: 'NoAplica'`, `isInTrial: false`, `paymentDueDate: null`
- AND the payment banner renders nothing for this session

## Verification Status

- Source change: `offline-auth-frontend` (archived 2026-07-29).
- Verify verdict: PASS WITH WARNINGS, 0 CRITICAL. Two scenarios in this
  capability ("An expired bundle falls back to online auth", "Inactive
  roster user is rejected distinctly") are proven only by composition of
  separately-tested units, not by a single end-to-end test driving an
  actually-expired/actually-inactive case through the rendered login form.
  See the archived verify report for detail.
- Source change (addendum): `offline-password-verifier` (archived
  2026-08-06) added the "A roster user with a null verifier degrades to
  OfflineVerifierError" requirement above. Verify verdict: PASS WITH
  WARNINGS, 0 CRITICAL (1 unrelated doc-drift WARNING on `tasks.md`,
  resolved at archive time). `offline-auth-service.ts` had zero diff for
  this delta — the existing `!user.verifier` guard already implemented the
  behavior; only the type contract and this test scenario were new.
