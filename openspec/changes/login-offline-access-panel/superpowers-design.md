# Offline Access From the Login Screen — Design

- **Date:** 2026-08-12
- **Status:** Approved design, pending implementation plan
- **Scope:** Frontend only (React `web-store-pos`). No backend, DB, or API changes.

## Goal

Give offline authentication two doors it does not have today, both on the login screen:

- **Activate** — a centred button below the login form that opens a dialog to import the activation file and turn offline login on.
- **Deactivate** — in the same place, when the device is already activated, a button that removes the activation after a confirmation.

Everything below the surface already exists and ships: import, deserialization, anti-replay, expiry, mode switching, and the DEK plumbing. This change is the missing interface, not new machinery.

## What exists today

| Piece | Where | State |
|---|---|---|
| Import UI | `app/auth/routes/provision.tsx` (`/auth/provision`) | Works. **No link points to it anywhere in the app** — the URL must be typed by hand. |
| Import logic | `roster-serializer.deserializeRoster` + `roster-store.importRoster` | Works. Called inline from `provision.tsx`. |
| Removal logic | `roster-store.clearRoster()` | Exists. **Called only by tests.** No component, no screen, no button. |
| Mode switch | `login.tsx:104-131` | Works. `isRosterProvisioned()` decides offline vs online; connectivity never does. |
| Export UI | `management/users/components/roster-export-panel.tsx` | Works. Admin-side, downloads `roster-<storeId>.smcabundle`. |

So the feature is complete and unreachable. A user cannot turn it on without being told a secret URL, and cannot turn it off at all.

## Decisions

### D1 — The dialog asks for the file and the password. The store id comes from the filename.

Importing needs three inputs, not two: `deserializeRoster(payload, master, storeId)` mixes the store id into the archive password at `roster-serializer.ts:74-82`. An empty or wrong store id surfaces as `WrongPasswordError` — the dialog would blame the password for a field the user never saw.

The export writes `roster-<storeId>.smcabundle` (`roster-export-panel.tsx:56`), so the store id already travels inside the filename. The dialog derives it there and never asks.

**Derivation:** `/^roster-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.smcabundle$/i` against `file.name`. The GUID shape is required, not optional: a loose `(.+)` would accept a renamed file and then fail as "wrong password", which is the exact lie D1 exists to prevent. A non-match raises its own error (see D5).

`provision.tsx` keeps its typed store-id field. The shared function takes the store id as an **optional** argument: the route passes its field, the dialog passes nothing and gets the filename derivation.

### D2 — Removal respects the anti-replay marker, and says so.

`clearRoster()` deliberately leaves `REPLAY_KEY` behind (`roster-store.ts:174-181`): "re-importing the same bundle after a manual clear must still be rejected as a replay". Deactivating is therefore a **one-way door** — the same file will not work again; the admin must export a new one.

That control is not weakened. The confirmation states the consequence in plain language before the user commits.

### D3 — `/auth/provision` stays alive. Both entry points share one implementation.

Deleting the route was the first choice and it does not survive contact with the test suite. `frontend-react/e2e/login.spec.ts:528` pins `const NEUTRAL_ROUTE = '/auth/provision'` for `REQ-8 (T8)`, and the surrounding comment explains why that route specifically: it needs a public route with **no `clientLoader`**, so both measured boots reach it identically. Verified against `routes.ts` — under `auth-layout`, `/login` and `/register` both declare `guestOnlyLoader`, and `/auth/provision` is the only route without one.

That symmetric origin *is* the fix for bug P-3 (react-router's hydration `replaceState`, measured 8/8 versus 0/7). Removing the route would silently undo it.

Per the project's non-negotiable rule, existing E2E tests are not modified to make a change convenient. **No E2E file is touched by this work.** The route survives as an unlinked fallback; the login dialog becomes the path users actually walk.

### D4 — The login screen now reads roster state at render.

Choosing which button to show requires knowing whether a roster exists *before* any submit. Today `login.tsx` reads nothing until the user presses "Ingresar", which upholds the headline invariant: "a device that never imported the roster is byte-for-byte unchanged".

This change makes a **deliberate, scoped exception**: one `localStorage` read per login-screen render, to pick a button. There is no way around it — the button cannot be chosen without the state it depends on.

The exception is contained:

- The read lives in `OfflineAccessPanel`, not in `login.tsx`.
- `roster-store` is loaded through a dynamic `import()`, so `login.tsx` keeps **zero static `offline/` imports**.
- `roster-store` has no runtime imports (one type-only import, erased at build) and a purity guard test proving no top-level side effects, so loading it evaluates function declarations and nothing else.

### D5 — A fifth error exists because of D1.

Deriving the store id from the filename introduces a failure mode the current code cannot have: a file whose name no longer carries the id. Without its own error, a renamed file reports "wrong password" and the user retries the correct password indefinitely. `UnknownFileError` exists to keep the message honest.

### D6 — Removal warns harder when local data would become unreadable.

`encryptEntity` (`storage/entity-crypto.ts:64-78`) returns plaintext when there is no DEK and neither `isEncryptionProvisioned()` nor `hasDeviceDekWrap()` holds; `decryptEntity` throws `MissingDataKeyError` for existing `enc:v1:` values with no DEK. So clearing the roster on a device that holds encrypted data **and** has no device-level wrap makes that data permanently unreadable while new writes go in as plaintext.

Normally the device wrap is present: `resolveDekForLogin` runs on every login, online and offline, and persists a table. But that persist is explicitly "best-effort, never fatal" (`dek-provisioning.ts:214`), so its absence is rare, not impossible.

Before showing the confirmation the panel evaluates `isEncryptionProvisioned() && !hasDeviceDekWrap()`. When true, the confirmation carries an extra sentence about the data. **Removal is never blocked** — blocking would strand a user whose only exit is the button being disabled. The user is told the truth and decides.

## Architecture

### New files

**`app/shared/lib/offline/roster-import.ts`** — the shared import path.

```
importRosterFile({ file, master, storeId? }): Promise<void>
deriveStoreIdFromFilename(filename): string | null
rosterImportErrorMessageId(err): string
class UnknownFileError extends Error   // name: 'UnknownFileError'
```

`importRosterFile` reads the file's bytes, resolves the store id (explicit argument, else filename derivation, else `UnknownFileError`), calls `deserializeRoster`, then `importRoster`. It adds no error handling of its own: `WrongPasswordError`, `CorruptFileError`, `ExpiredBundleError` and `ReplayBundleError` propagate untouched.

`rosterImportErrorMessageId` is `provision.tsx`'s existing `provisionErrorMessageId` moved here and extended with the `UnknownFileError` case, so both entry points map failures identically and cannot drift.

**`app/auth/components/offline-access-panel.tsx`** — owns the state, renders one button.

Roster state is a three-way value: `'unknown' | 'provisioned' | 'absent'`. It starts `'unknown'` and a mount effect resolves it through the dynamic import. While `'unknown'` the panel renders `null`; it sits at the very bottom of the page, so nothing above it shifts. `'absent'` renders the activate button, `'provisioned'` the deactivate button. A successful import sets `'provisioned'`; a successful removal sets `'absent'`.

Both buttons use the shared `Button` component with `variant="outline"`, matching `roster-export-panel.tsx`'s treatment of the same kind of secondary, device-level action.

Every module the panel reaches for is loaded through a dynamic `import()` — `offline/roster-store`, `offline/roster-import` and `storage/device-dek-table` alike. `device-dek-table` sits outside `offline/` but is pulled in for the same reason: nothing that exists to serve offline authentication should be evaluated on a login screen that may never need it.

The two success messages (`OFFLINE_ACCESS.ENABLED`, `OFFLINE_ACCESS.DISABLED`) are shown with `showToastSuccess()` from `shared/lib/toast.tsx` — non-blocking, and the established precedent for exactly this shape: `sync/components/import-form.tsx:57` fires a toast after importing a file, having been moved there from an inline banner by the toast-notifications-parity work. `ToastContainer` is mounted in `root.tsx:63`, above the router, so toasts render on `/login` like anywhere else.

An inline banner is deliberately not used: the login screen already carries three (`isOffline`, `isUnlockRequired`, `errors.form`) and a fourth would compete with them for the same space.

**`app/auth/components/import-roster-modal.tsx`** — the dialog.

Follows the house modal pattern from `shared/components/unsaved-changes-dialog.tsx`: a `fixed inset-0 z-50` overlay with a centred white card. Fields: `FileInput` (`accept=".smcabundle"`) and a password input with the eye toggle used elsewhere in the app. Buttons: Cancel and Activate.

### Modified files

- **`app/auth/routes/login.tsx`** — one import and one line, `<OfflineAccessPanel />`, below the existing centred "¿No tenés cuenta?" block at `login.tsx:278-283`. Nothing else changes.
- **`app/auth/routes/provision.tsx`** — its inline `deserializeRoster` + `importRoster` pair becomes one `importRosterFile` call, and its local `provisionErrorMessageId` is replaced by the shared mapper. Its UI, its store-id field, and its success screen are unchanged.
- **`app/shared/lib/i18n/es.ts`** — new keys, plus three rewordings (see Copy).

### Not created

Removal uses `confirmDialog()` from `shared/lib/blocking-alert.ts`, the app's standard confirm/cancel dialog. No new confirmation component.

## Flows

### Activate

1. Panel shows **"Activar acceso sin conexión"**.
2. Click opens the dialog.
3. User picks the file and types the password.
4. Activate → `importRosterFile({ file, master })`.
5. Success → dialog closes, success message shows, button flips to deactivate.
6. Failure → **dialog stays open** with the message inline, so the file selection and typed password survive the error.

Client-side validation before the call: no file selected, or an empty password, each with its own message. Neither reaches the import.

### Deactivate

1. Panel shows **"Desactivar acceso sin conexión"**.
2. Click evaluates `isEncryptionProvisioned() && !hasDeviceDekWrap()` to pick the message variant.
3. `confirmDialog()` with the chosen message.
4. Confirmed → `clearRoster()`, success message, button flips to activate.
5. Cancelled, dismissed, or escaped → nothing happens. `confirmDialog` resolves `false` for all three.

## Copy

All user-facing strings avoid *roster*, *bundle* and *aprovisionar* — internal vocabulary that means nothing to a store operator. Voseo, matching the rest of `es.ts`.

### New keys

| Key | Text |
|---|---|
| `OFFLINE_ACCESS.ENABLE_BUTTON` | Activar acceso sin conexión |
| `OFFLINE_ACCESS.DISABLE_BUTTON` | Desactivar acceso sin conexión |
| `OFFLINE_ACCESS.MODAL_TITLE` | Activar acceso sin conexión |
| `OFFLINE_ACCESS.MODAL_INTRO` | Con esto vas a poder entrar a este equipo aunque no haya internet. Necesitás el archivo de activación y su contraseña — pedíselos al administrador de tu tienda. |
| `OFFLINE_ACCESS.FILE_LABEL` | Archivo de activación |
| `OFFLINE_ACCESS.PASSWORD_LABEL` | Contraseña de activación |
| `OFFLINE_ACCESS.SUBMIT` | Activar |
| `OFFLINE_ACCESS.ENABLED` | Listo. Este equipo ya puede entrar sin internet. |
| `OFFLINE_ACCESS.ERROR_NO_FILE` | Elegí el archivo de activación. |
| `OFFLINE_ACCESS.DISABLE_TITLE` | ¿Desactivar el acceso sin conexión? |
| `OFFLINE_ACCESS.DISABLE_MESSAGE` | Este equipo va a necesitar internet para entrar. Para volver a activarlo vas a tener que pedir un archivo nuevo: el que usaste ya no sirve. |
| `OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS` | Este equipo va a necesitar internet para entrar. Para volver a activarlo vas a tener que pedir un archivo nuevo: el que usaste ya no sirve. Además, los datos guardados en este equipo van a quedar ilegibles. |
| `OFFLINE_ACCESS.DISABLE_CONFIRM` | Sí, desactivar |
| `OFFLINE_ACCESS.DISABLED` | Acceso sin conexión desactivado. |
| `PROVISION.ERROR_UNKNOWN_FILE` | No pudimos reconocer el archivo. Usalo tal como te lo pasaron, sin cambiarle el nombre. |

`GENERAL.CANCEL` and `SYNC.ERROR_EMPTY_PASSWORD` are reused as-is. `SYNC.ERROR_NO_FILE` is **not** reused — it reads "Seleccioná un archivo de respaldo", which describes a backup, not an activation file.

The two `DISABLE_MESSAGE` variants are stored as complete sentences rather than a base plus an appended fragment, so each reads as written prose and neither depends on concatenation order.

### Reworded existing keys

The four import errors are shared by both entry points, so they keep their `PROVISION.ERROR_*` ids and are reworded once:

| Key | Before | After |
|---|---|---|
| `PROVISION.ERROR_WRONG_PASSWORD` | La contraseña maestra es incorrecta. | La contraseña de activación es incorrecta. |
| `PROVISION.ERROR_EXPIRED` | Este archivo de roster ya venció. Solicitá uno nuevo. | Este archivo de activación ya venció. Pedile uno nuevo al administrador. |
| `PROVISION.ERROR_REPLAY` | Este archivo de roster ya fue importado en este dispositivo. | Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador. |
| `PROVISION.ERROR_CORRUPT_FILE` | *(unchanged)* | El archivo está dañado o no tiene un formato válido. |

**Cost, stated explicitly:** three assertions in an existing **unit** test pin these strings verbatim — `provision.test.tsx:126`, `:155`, `:172` — and must be updated in the same commit. Verified that no file under `frontend-react/e2e/` asserts any of these strings, so the E2E rule is not engaged. The alternative, leaving the old wording and giving the dialog its own copy, was rejected: one failure with two wordings is exactly the drift the shared mapper exists to prevent.

## Testing

Strict TDD is active for this project (`openspec/config.yaml: strict_tdd: true`). Every unit below is written test-first.

**`roster-import.ts`**
- Derives the store id from a well-formed filename.
- An explicit store id wins over the filename.
- A filename without a GUID raises `UnknownFileError`; a renamed file never reports "wrong password".
- Each of the four existing errors propagates unchanged.

**`offline-access-panel.tsx`**
- Renders nothing while roster state is unknown.
- Activate button when absent; deactivate button when provisioned.
- Flips to deactivate after a successful import.
- Flips to activate after a successful removal.
- A cancelled confirmation calls neither `clearRoster` nor any state change.
- The data-loss sentence appears only when `isEncryptionProvisioned() && !hasDeviceDekWrap()`.

**`import-roster-modal.tsx`**
- No file, or empty password, blocks submission with its own message.
- An import failure leaves the dialog open with the message inline.
- Success closes the dialog.

**`provision.test.tsx` must stay green** (with its three reworded assertions). It is the regression guard proving the extraction did not change behaviour.

**New Playwright spec** — the only end-to-end proof: import from the login screen → button flips → sign in with no network → deactivate → button flips back. Adding a **new** E2E file is permitted; no existing spec or support file is touched.

**Execution note:** Playwright and `dotnet` are run by the user, not by the agent. The agent runs the frontend unit gates only.

## Constraints carried into implementation

1. **No E2E file is modified.** Not `login.spec.ts`, not `login-offline.spec.ts`, not anything under `e2e/support/`. `/auth/provision` exists partly to keep that promise (D3).
2. **`login.tsx` keeps zero static `offline/` imports.** The panel owns the dynamic import.
3. **The anti-replay marker is not cleared** by any code path in this change.
4. **Removal is never blocked**, only explained (D6).
5. `roster-store`'s purity guard test must stay green — nothing in this change may give it a runtime import or a top-level side effect.

## Out of scope

- Any change to the export side (`roster-export-panel.tsx`) or the backend endpoint.
- Any change to how offline authentication itself works: the mode switch, expiry handling, and DEK resolution are untouched.
- Removing `/auth/provision` or its store-id field (D3).
- Cleaning up the device DEK table on removal. The wrap is what keeps local data readable after deactivation (D6); deleting it would cause the very data loss the warning is about.
