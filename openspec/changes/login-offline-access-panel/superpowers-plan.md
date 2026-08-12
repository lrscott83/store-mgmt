# Offline Access From the Login Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Design spec (read first for full rationale & rules):** [`openspec/changes/login-offline-access-panel/superpowers-design.md`](./superpowers-design.md)

**Goal:** Put two buttons on the login screen — activate offline access by importing an activation file, and deactivate it — so a feature that already ships stops being unreachable.

**Architecture:** One shared module owns the import path and is consumed by both the existing `/auth/provision` route and a new dialog. A single self-contained panel component owns the roster-state check and renders whichever button applies; `login.tsx` gains one line and nothing else.

**Tech Stack:** React 19, react-router v7 (`ssr: false`), react-intl, Vitest + Testing Library, Tailwind, SweetAlert2 (via `shared/lib/blocking-alert.ts`), react-toastify (via `shared/lib/toast.tsx`), `@zip.js/zip.js` (already wrapped by `roster-serializer.ts`).

**Working directory:** All paths below are relative to `frontend-react/apps/web-store-pos/`.

## Global Constraints

Every task's requirements implicitly include this section.

- **No existing E2E file may be modified.** Not `e2e/login.spec.ts`, not `e2e/login-offline.spec.ts`, not anything under `e2e/support/`. `e2e/login.spec.ts:528` pins `/auth/provision` as T8's neutral origin; that route must keep resolving. Adding a **new** spec file is permitted. If any change appears to require touching an existing E2E file or support file, STOP and ask the user.
- **Do not run Playwright and do not run `dotnet`.** The user runs those. The agent runs frontend unit gates only.
- **`login.tsx` keeps zero static imports from `shared/lib/offline/`.** Every offline module reaches the login screen through a dynamic `import()` inside the panel.
- **The anti-replay marker is never cleared.** No task may touch `REPLAY_KEY` or change `clearRoster()`.
- **Deactivation is never blocked**, only explained.
- **`roster-store.ts` gains no runtime import and no top-level side effect** — `app/shared/lib/offline/__tests__/roster-store.purity.test.ts` must stay green.
- **Copy is exact.** Spanish strings are copied verbatim from this plan, including accents and the em dash in `OFFLINE_ACCESS.MODAL_INTRO`. Never invent or paraphrase user-facing text.
- **Conventional commits, no AI attribution.** No `Co-Authored-By` trailer.
- Test gate for every task: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`. The `--force` flag is mandatory — turbo replays cached runs otherwise, and a replayed pass is not evidence.

## File Structure

| File | Responsibility |
|---|---|
| `app/shared/lib/offline/roster-import.ts` **(create)** | The one import path: resolve store id, deserialize, import. Maps failures to message ids. |
| `app/shared/lib/offline/__tests__/roster-import.test.ts` **(create)** | Unit tests for the above. |
| `app/auth/components/import-roster-modal.tsx` **(create)** | The activation dialog: file + password + submit. |
| `app/auth/components/__tests__/import-roster-modal.test.tsx` **(create)** | Unit tests for the dialog. |
| `app/auth/components/offline-access-panel.tsx` **(create)** | Owns roster state, renders one button, opens dialog or confirmation. |
| `app/auth/components/__tests__/offline-access-panel.test.tsx` **(create)** | Unit tests for the panel. |
| `app/auth/routes/provision.tsx` **(modify)** | Delegates to the shared module. UI unchanged. |
| `app/auth/routes/__tests__/provision.test.tsx` **(modify)** | Three reworded string assertions. |
| `app/shared/lib/i18n/es.ts` **(modify)** | New `OFFLINE_ACCESS.*` keys, new `PROVISION.ERROR_UNKNOWN_FILE`, three reworded `PROVISION.ERROR_*` values. |
| `app/auth/routes/login.tsx` **(modify)** | One import, one line. |
| `e2e/offline-access-panel.spec.ts` **(create)** | New Playwright spec. Run by the user. |

---

### Task 1: The shared import path

**Files:**
- Create: `app/shared/lib/offline/roster-import.ts`
- Create: `app/shared/lib/offline/__tests__/roster-import.test.ts`

**Interfaces:**
- Consumes: `deserializeRoster(payload, master, storeId)` from `./roster-serializer`; `importRoster(bundle)` from `./roster-store`.
- Produces:
  - `deriveStoreIdFromFilename(filename: string): string | null`
  - `importRosterFile(args: { file: File; master: string; storeId?: string }): Promise<void>`
  - `rosterImportErrorMessageId(err: unknown): string`
  - `class UnknownFileError extends Error` with `name === 'UnknownFileError'`

**Background the implementer needs:** `deserializeRoster` mixes the store id into the archive password (`roster-serializer.ts:81`), so a wrong store id surfaces as `WrongPasswordError`. The export names its file `roster-<storeId>.smcabundle` (`management/users/components/roster-export-panel.tsx:56`), which is where the id is recovered from. The four existing error classes are `WrongPasswordError` and `CorruptFileError` (in `roster-serializer.ts`) and `ExpiredBundleError` and `ReplayBundleError` (in `roster-store.ts`); they are matched by `err.name`, never by `instanceof`, because that is what `provision.tsx:22-36` already does.

- [ ] **Step 1: Write the failing tests**

Create `app/shared/lib/offline/__tests__/roster-import.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveStoreIdFromFilename,
  importRosterFile,
  rosterImportErrorMessageId,
  UnknownFileError,
} from '../roster-import';
import { serializeRoster } from '../roster-serializer';
import { getRoster, importRoster } from '../roster-store';
import type { OfflineRosterBundle } from '../roster-types';

const STORE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: STORE_ID,
    users: [],
    ...overrides,
  };
}

function makeFile(payload: Uint8Array, name = `roster-${STORE_ID}.smcabundle`): File {
  return new File([payload], name);
}

describe('deriveStoreIdFromFilename', () => {
  it('recovers the store id from an unmodified export filename', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID}.smcabundle`)).toBe(STORE_ID);
  });

  it('is case-insensitive about the GUID', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID.toUpperCase()}.smcabundle`)).toBe(
      STORE_ID.toUpperCase(),
    );
  });

  it('returns null when the name carries no GUID', () => {
    expect(deriveStoreIdFromFilename('roster.smcabundle')).toBeNull();
    expect(deriveStoreIdFromFilename('roster-mi-tienda.smcabundle')).toBeNull();
  });

  it('returns null for the right GUID under the wrong extension', () => {
    expect(deriveStoreIdFromFilename(`roster-${STORE_ID}.zip`)).toBeNull();
  });
});

describe('importRosterFile', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports using the store id taken from the filename', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await importRosterFile({ file, master: 'master' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('prefers an explicit store id over the filename', async () => {
    // Serialized under EXPLICIT_ID while the filename advertises STORE_ID:
    // only the explicit argument can open it, so a pass proves precedence.
    const EXPLICIT_ID = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    const bundle = makeBundle({ storeId: EXPLICIT_ID });
    const file = makeFile(await serializeRoster(bundle, 'master', EXPLICIT_ID));

    await importRosterFile({ file, master: 'master', storeId: EXPLICIT_ID });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('falls back to the filename when the explicit store id is blank', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await importRosterFile({ file, master: 'master', storeId: '   ' });

    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('throws UnknownFileError for a renamed file instead of blaming the password', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID), 'activacion.smcabundle');

    await expect(importRosterFile({ file, master: 'master' })).rejects.toThrow(UnknownFileError);
    expect(getRoster()).toBeNull();
  });

  it('propagates WrongPasswordError untouched', async () => {
    const bundle = makeBundle();
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'incorrect' })).rejects.toMatchObject({
      name: 'WrongPasswordError',
    });
    expect(getRoster()).toBeNull();
  });

  it('propagates CorruptFileError untouched', async () => {
    const file = makeFile(new Uint8Array([1, 2, 3, 4, 5]));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'CorruptFileError',
    });
  });

  it('propagates ExpiredBundleError untouched', async () => {
    const bundle = makeBundle({ expiresAt: Date.now() - 1000 });
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'ExpiredBundleError',
    });
  });

  it('propagates ReplayBundleError untouched and leaves the stored roster alone', async () => {
    const bundle = makeBundle();
    importRoster(bundle);
    const file = makeFile(await serializeRoster(bundle, 'master', STORE_ID));

    await expect(importRosterFile({ file, master: 'master' })).rejects.toMatchObject({
      name: 'ReplayBundleError',
    });
    expect(getRoster()?.bundleId).toBe('b1');
  });
});

describe('rosterImportErrorMessageId', () => {
  it('maps each failure to its own message id', () => {
    expect(rosterImportErrorMessageId({ name: 'WrongPasswordError' })).toBe(
      'PROVISION.ERROR_WRONG_PASSWORD',
    );
    expect(rosterImportErrorMessageId({ name: 'CorruptFileError' })).toBe(
      'PROVISION.ERROR_CORRUPT_FILE',
    );
    expect(rosterImportErrorMessageId({ name: 'ExpiredBundleError' })).toBe(
      'PROVISION.ERROR_EXPIRED',
    );
    expect(rosterImportErrorMessageId({ name: 'ReplayBundleError' })).toBe(
      'PROVISION.ERROR_REPLAY',
    );
    expect(rosterImportErrorMessageId(new UnknownFileError())).toBe(
      'PROVISION.ERROR_UNKNOWN_FILE',
    );
  });

  it('falls back to the corrupt-file message for anything unrecognised', () => {
    expect(rosterImportErrorMessageId(null)).toBe('PROVISION.ERROR_CORRUPT_FILE');
    expect(rosterImportErrorMessageId(new Error('boom'))).toBe('PROVISION.ERROR_CORRUPT_FILE');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-import.test.ts`
Expected: FAIL — `Failed to resolve import "../roster-import"`.

- [ ] **Step 3: Write the implementation**

Create `app/shared/lib/offline/roster-import.ts`:

```ts
import { deserializeRoster } from './roster-serializer';
import { importRoster } from './roster-store';

/**
 * The export writes `roster-<storeId>.smcabundle`
 * (`management/users/components/roster-export-panel.tsx:56`), so the store id
 * the archive password needs already travels in the filename.
 *
 * The GUID shape is REQUIRED, not a convenience. A loose `(.+)` would happily
 * accept a renamed file, hand the wrong id to `deserializeRoster`, and surface
 * the result as `WrongPasswordError` — telling the user their correct password
 * is wrong. Refusing to guess is what makes `UnknownFileError` possible.
 */
const ROSTER_FILENAME_PATTERN =
  /^roster-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.smcabundle$/i;

/** The filename carries no recoverable store id (renamed, or not an export at all). */
export class UnknownFileError extends Error {
  constructor(message = 'The filename carries no store id') {
    super(message);
    this.name = 'UnknownFileError';
  }
}

export function deriveStoreIdFromFilename(filename: string): string | null {
  return ROSTER_FILENAME_PATTERN.exec(filename)?.[1] ?? null;
}

/**
 * The ONE import path, shared by the login dialog and `/auth/provision` so a
 * failure can never mean two different things in two places.
 *
 * `storeId` is optional: the route passes its typed field, the dialog passes
 * nothing and gets the filename derivation. A blank or whitespace-only value
 * counts as absent — `provision.tsx`'s field starts as `''` and is not
 * required, and falling back to the filename beats failing as "wrong password".
 *
 * Throws `UnknownFileError`, or propagates `WrongPasswordError`,
 * `CorruptFileError`, `ExpiredBundleError` and `ReplayBundleError` untouched.
 */
export async function importRosterFile(args: {
  file: File;
  master: string;
  storeId?: string;
}): Promise<void> {
  const { file, master } = args;
  const explicit = args.storeId?.trim();
  const storeId = explicit ? explicit : deriveStoreIdFromFilename(file.name);
  if (storeId === null) {
    throw new UnknownFileError();
  }

  const payload = new Uint8Array(await file.arrayBuffer());
  const bundle = await deserializeRoster(payload, master, storeId);
  importRoster(bundle);
}

/**
 * Dispatches by `err.name`, never `instanceof` — the shape `provision.tsx`
 * already used, and the only one that survives the module being reached
 * through a dynamic `import()`.
 */
export function rosterImportErrorMessageId(err: unknown): string {
  switch ((err as { name?: string } | null)?.name) {
    case 'WrongPasswordError':
      return 'PROVISION.ERROR_WRONG_PASSWORD';
    case 'CorruptFileError':
      return 'PROVISION.ERROR_CORRUPT_FILE';
    case 'ExpiredBundleError':
      return 'PROVISION.ERROR_EXPIRED';
    case 'ReplayBundleError':
      return 'PROVISION.ERROR_REPLAY';
    case 'UnknownFileError':
      return 'PROVISION.ERROR_UNKNOWN_FILE';
    default:
      return 'PROVISION.ERROR_CORRUPT_FILE';
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/shared/lib/offline/__tests__/roster-import.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add app/shared/lib/offline/roster-import.ts app/shared/lib/offline/__tests__/roster-import.test.ts
git commit -m "feat(offline): add a shared roster import path that derives the store id from the filename"
```

---

### Task 2: Rewire `/auth/provision` onto the shared path and fix the copy

**Files:**
- Modify: `app/shared/lib/i18n/es.ts:105-108`
- Modify: `app/auth/routes/provision.tsx:9-10,22-36,62-77`
- Modify: `app/auth/routes/__tests__/provision.test.tsx:126,155,172`

**Interfaces:**
- Consumes: `importRosterFile`, `rosterImportErrorMessageId` from Task 1.
- Produces: nothing new. This task proves the extraction changed no behaviour.

**Why the copy changes here and not later:** the four error messages are shared by both entry points. Rewording them once, in the task that makes them shared, is what stops the same failure from having two wordings.

- [ ] **Step 1: Reword the messages and add the new one**

In `app/shared/lib/i18n/es.ts`, replace the three values and add the fourth key:

```ts
  'PROVISION.ERROR_WRONG_PASSWORD': 'La contraseña de activación es incorrecta.',
  'PROVISION.ERROR_CORRUPT_FILE': 'El archivo está dañado o no tiene un formato válido.',
  'PROVISION.ERROR_EXPIRED': 'Este archivo de activación ya venció. Pedile uno nuevo al administrador.',
  'PROVISION.ERROR_REPLAY': 'Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.',
  'PROVISION.ERROR_UNKNOWN_FILE':
    'No pudimos reconocer el archivo. Usalo tal como te lo pasaron, sin cambiarle el nombre.',
```

`PROVISION.ERROR_CORRUPT_FILE` is listed for position only — its value does not change.

- [ ] **Step 2: Update the three assertions that pin the old wording**

In `app/auth/routes/__tests__/provision.test.tsx`, replace the expected strings:

- line 126: `'La contraseña maestra es incorrecta.'` → `'La contraseña de activación es incorrecta.'`
- line 155: `'Este archivo de roster ya venció. Solicitá uno nuevo.'` → `'Este archivo de activación ya venció. Pedile uno nuevo al administrador.'`
- line 172: `'Este archivo de roster ya fue importado en este dispositivo.'` → `'Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.'`

Change nothing else in this file. The `getByLabelText(/contraseña maestra/i)` query at line 49 still resolves, because `PROVISION.MASTER_PASSWORD_LABEL` is not being reworded.

- [ ] **Step 3: Run the provision tests to confirm the rewording is self-consistent**

Run: `npx vitest run app/auth/routes/__tests__/provision.test.tsx`
Expected: PASS.

This is not the usual red step, and that is deliberate: the i18n values and the assertions that pin them were changed together in Steps 1-2, so they must agree *before* the refactor moves the implementation underneath them. A FAIL here means a string was mistyped — most likely an accent or the em dash. Fix it before touching the route, or Step 5 will not be able to tell a typo apart from a broken refactor.

- [ ] **Step 4: Rewire the route onto the shared module**

In `app/auth/routes/provision.tsx`:

Replace the two imports at lines 9-10:

```ts
import { importRosterFile, rosterImportErrorMessageId } from '~/shared/lib/offline/roster-import';
```

Delete the whole local `provisionErrorMessageId` function (lines 22-36) along with its doc comment.

Replace the body of the `try` block (lines 64-71) with:

```ts
      await importRosterFile({ file, master, storeId });
      setSuccess(true);
```

and the `catch` at line 73 with:

```ts
      setError(intl.formatMessage({ id: rosterImportErrorMessageId(err) }));
```

- [ ] **Step 5: Run the provision tests to verify they still pass**

Run: `npx vitest run app/auth/routes/__tests__/provision.test.tsx`
Expected: PASS, unchanged count. This is the regression gate: the same tests, the same assertions, a different implementation underneath.

- [ ] **Step 6: Run the full unit gate**

Run: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Expected: PASS. Watch specifically that `roster-store.purity.test.ts` is still green.

- [ ] **Step 7: Commit**

```bash
git add app/shared/lib/i18n/es.ts app/auth/routes/provision.tsx app/auth/routes/__tests__/provision.test.tsx
git commit -m "refactor(offline): route /auth/provision through the shared import path and drop jargon from its errors"
```

---

### Task 3: The activation dialog

**Files:**
- Create: `app/auth/components/import-roster-modal.tsx`
- Create: `app/auth/components/__tests__/import-roster-modal.test.tsx`
- Modify: `app/shared/lib/i18n/es.ts`

**Interfaces:**
- Consumes: `importRosterFile`, `rosterImportErrorMessageId` from Task 1.
- Produces: `ImportRosterModal` — a named export taking `{ onImported: () => void; onCancel: () => void }`. `onImported` fires only after a successful import. Task 4 renders it.

**Background the implementer needs:** `FileInput` (`app/shared/components/ui/file-input.tsx`) hides the native `<input type="file">` behind a Spanish trigger button, so tests reach it with `document.querySelector('input[type="file"]')` and a defined `files` property — the helper is copied below. The house modal shape is `shared/components/unsaved-changes-dialog.tsx`: a `fixed inset-0 z-50` overlay with a centred white card.

- [ ] **Step 1: Add the dialog's copy**

In `app/shared/lib/i18n/es.ts`, next to the existing `PROVISION.*` block:

```ts
  'OFFLINE_ACCESS.MODAL_TITLE': 'Activar acceso sin conexión',
  'OFFLINE_ACCESS.MODAL_INTRO':
    'Con esto vas a poder entrar a este equipo aunque no haya internet. Necesitás el archivo de activación y su contraseña — pedíselos al administrador de tu tienda.',
  'OFFLINE_ACCESS.FILE_LABEL': 'Archivo de activación',
  'OFFLINE_ACCESS.PASSWORD_LABEL': 'Contraseña de activación',
  'OFFLINE_ACCESS.SUBMIT': 'Activar',
  'OFFLINE_ACCESS.ERROR_NO_FILE': 'Elegí el archivo de activación.',
```

- [ ] **Step 2: Write the failing tests**

Create `app/auth/components/__tests__/import-roster-modal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import { ImportRosterModal } from '../import-roster-modal';
import { serializeRoster } from '~/shared/lib/offline/roster-serializer';
import { getRoster } from '~/shared/lib/offline/roster-store';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const STORE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: STORE_ID,
    users: [],
    ...overrides,
  };
}

function renderModal(overrides: Partial<{ onImported: () => void; onCancel: () => void }> = {}) {
  const onImported = overrides.onImported ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  render(
    <IntlProvider locale="es" messages={messages}>
      <ImportRosterModal onImported={onImported} onCancel={onCancel} />
    </IntlProvider>,
  );
  return { onImported, onCancel };
}

// `FileInput` hides the native input, so the file is attached directly to it.
function selectFile(payload: Uint8Array, name = `roster-${STORE_ID}.smcabundle`) {
  const file = new File([payload], name);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

function typePasswordAndSubmit(master: string) {
  fireEvent.change(screen.getByLabelText(/contraseña de activación/i), {
    target: { value: master },
  });
  fireEvent.click(screen.getByRole('button', { name: /^activar$/i }));
}

describe('ImportRosterModal', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports the file and calls onImported', async () => {
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const { onImported } = renderModal();

    selectFile(payload);
    typePasswordAndSubmit('master');

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('refuses to submit with no file chosen', async () => {
    const { onImported } = renderModal();

    typePasswordAndSubmit('master');

    expect(await screen.findByText('Elegí el archivo de activación.')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('refuses to submit with an empty password', async () => {
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const { onImported } = renderModal();

    selectFile(payload);
    typePasswordAndSubmit('   ');

    expect(await screen.findByText('La contraseña no puede estar vacía.')).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with the message inline when the password is wrong', async () => {
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const { onImported } = renderModal();

    selectFile(payload);
    typePasswordAndSubmit('incorrect');

    expect(
      await screen.findByText('La contraseña de activación es incorrecta.'),
    ).toBeInTheDocument();
    // Still open: the field the user typed into is still on screen.
    expect(screen.getByLabelText(/contraseña de activación/i)).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('blames the filename, not the password, when the file was renamed', async () => {
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    renderModal();

    selectFile(payload, 'activacion.smcabundle');
    typePasswordAndSubmit('master');

    expect(
      await screen.findByText(
        'No pudimos reconocer el archivo. Usalo tal como te lo pasaron, sin cambiarle el nombre.',
      ),
    ).toBeInTheDocument();
  });

  it('calls onCancel when the user cancels', () => {
    const { onCancel } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run app/auth/components/__tests__/import-roster-modal.test.tsx`
Expected: FAIL — `Failed to resolve import "../import-roster-modal"`.

- [ ] **Step 4: Write the implementation**

Create `app/auth/components/import-roster-modal.tsx`:

```tsx
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { FileInput } from '~/shared/components/ui/file-input';
import { InfoBox } from '~/shared/components/ui/info-box';
import { EyeIcon, EyeOffIcon } from '~/shared/components/ui/icons';

interface ImportRosterModalProps {
  /** Fired only after the roster is actually stored. */
  onImported: () => void;
  onCancel: () => void;
}

/**
 * Activation dialog for the login screen. Asks for the file and the password
 * only — the store id `deserializeRoster` needs is recovered from the
 * filename by `importRosterFile` (design D1), so the user is never asked for
 * an identifier they have no way of knowing.
 *
 * Overlay shape follows `shared/components/unsaved-changes-dialog.tsx`.
 */
export function ImportRosterModal({ onImported, onCancel }: ImportRosterModalProps) {
  const intl = useIntl();
  const [file, setFile] = useState<File | null>(null);
  const [master, setMaster] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!file) {
      setError(intl.formatMessage({ id: 'OFFLINE_ACCESS.ERROR_NO_FILE' }));
      return;
    }
    if (!master.trim()) {
      setError(intl.formatMessage({ id: 'SYNC.ERROR_EMPTY_PASSWORD' }));
      return;
    }

    setBusy(true);
    // Dynamic import: this is the login screen, and a device that never
    // activates offline access must not pay for the offline modules
    // (design D4).
    const { importRosterFile, rosterImportErrorMessageId } = await import(
      '~/shared/lib/offline/roster-import'
    );
    try {
      await importRosterFile({ file, master });
      onImported();
    } catch (err: unknown) {
      // Stay open on failure — the chosen file and typed password survive,
      // so the user retries the one thing that was wrong.
      setBusy(false);
      setError(intl.formatMessage({ id: rosterImportErrorMessageId(err) }));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 text-left">
        <h3 className="text-base font-semibold text-gray-800 mb-2">
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.MODAL_TITLE' })}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.MODAL_INTRO' })}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label
              htmlFor="offline-access-file"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.FILE_LABEL' })}
            </label>
            <FileInput
              id="offline-access-file"
              accept=".smcabundle"
              onFileChange={setFile}
              disabled={busy}
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="offline-access-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.PASSWORD_LABEL' })}
            </label>
            <div className="relative">
              <input
                id="offline-access-password"
                type={showPassword ? 'text' : 'password'}
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={intl.formatMessage({
                  id: showPassword ? 'SYNC.HIDE_PASSWORD' : 'SYNC.SHOW_PASSWORD',
                })}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeOffIcon className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4">
              <InfoBox variant="danger">{error}</InfoBox>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
              {intl.formatMessage({ id: 'GENERAL.CANCEL' })}
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {intl.formatMessage({ id: 'OFFLINE_ACCESS.SUBMIT' })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ImportRosterModal;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/auth/components/__tests__/import-roster-modal.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add app/auth/components/import-roster-modal.tsx app/auth/components/__tests__/import-roster-modal.test.tsx app/shared/lib/i18n/es.ts
git commit -m "feat(auth): add the offline access activation dialog"
```

---

### Task 4: The panel, and its one line in the login screen

**Files:**
- Create: `app/auth/components/offline-access-panel.tsx`
- Create: `app/auth/components/__tests__/offline-access-panel.test.tsx`
- Modify: `app/shared/lib/i18n/es.ts`
- Modify: `app/auth/routes/login.tsx:1-12,278-283`

**Interfaces:**
- Consumes: `ImportRosterModal` from Task 3; `confirmDialog` from `~/shared/lib/blocking-alert`; `showToastSuccess` from `~/shared/lib/toast`; `isRosterProvisioned`, `isEncryptionProvisioned`, `clearRoster` from `~/shared/lib/offline/roster-store`; `hasDeviceDekWrap` from `~/shared/lib/storage/device-dek-table`.
- Produces: `OfflineAccessPanel` — a named export taking no props.

**Background the implementer needs:** `confirmDialog(options)` returns `Promise<boolean>` and resolves `false` for cancel, backdrop click and Escape alike. `hasDeviceDekWrap()` is true when the device table has a device wrap **or** any user entry (`storage/device-dek-table.ts:75-79`). The data-loss variant is reached by importing a `formatVersion: 2` bundle carrying wrap fields — that alone makes `isEncryptionProvisioned()` true — while writing no device table, which keeps `hasDeviceDekWrap()` false.

- [ ] **Step 1: Add the panel's copy**

In `app/shared/lib/i18n/es.ts`, alongside the Task 3 keys:

```ts
  'OFFLINE_ACCESS.ENABLE_BUTTON': 'Activar acceso sin conexión',
  'OFFLINE_ACCESS.DISABLE_BUTTON': 'Desactivar acceso sin conexión',
  'OFFLINE_ACCESS.ENABLED': 'Listo. Este equipo ya puede entrar sin internet.',
  'OFFLINE_ACCESS.DISABLED': 'Acceso sin conexión desactivado.',
  'OFFLINE_ACCESS.DISABLE_TITLE': '¿Desactivar el acceso sin conexión?',
  'OFFLINE_ACCESS.DISABLE_MESSAGE':
    'Este equipo va a necesitar internet para entrar. Para volver a activarlo vas a tener que pedir un archivo nuevo: el que usaste ya no sirve.',
  'OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS':
    'Este equipo va a necesitar internet para entrar. Para volver a activarlo vas a tener que pedir un archivo nuevo: el que usaste ya no sirve. Además, los datos guardados en este equipo van a quedar ilegibles.',
  'OFFLINE_ACCESS.DISABLE_CONFIRM': 'Sí, desactivar',
```

Both `DISABLE_MESSAGE` variants are stored whole, never as a base plus an appended fragment, so each reads as written prose.

- [ ] **Step 2: Write the failing tests**

Create `app/auth/components/__tests__/offline-access-panel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import { OfflineAccessPanel } from '../offline-access-panel';
import { importRoster, isRosterProvisioned } from '~/shared/lib/offline/roster-store';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const STORE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const confirmDialogMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialogMock(...args),
}));

const showToastSuccessMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/toast', () => ({
  showToastSuccess: (...args: unknown[]) => showToastSuccessMock(...args),
}));

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: STORE_ID,
    users: [],
    ...overrides,
  };
}

/**
 * v2 + non-empty wrap fields makes isEncryptionProvisioned() true; no device
 * table is written, so hasDeviceDekWrap() stays false. Together that is the
 * only state that produces the data-loss warning.
 *
 * `OfflineRosterUser` has twelve required fields — spelled out in full rather
 * than cast, so a shape change fails this test instead of hiding behind an
 * `as`.
 */
function makeEncryptedBundle(): OfflineRosterBundle {
  return makeBundle({
    formatVersion: 2,
    users: [
      {
        id: 'u1',
        login: 'jdoe',
        fullName: 'Juana Doe',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: true,
        isReSeller: false,
        selectedStoreId: STORE_ID,
        verifier: null,
        wrappedDek: 'd2hhdGV2ZXI=',
        wrapSalt: 'c2FsdA==',
        wrapIv: 'aXY=',
      },
    ],
  });
}

function renderPanel() {
  render(
    <IntlProvider locale="es" messages={messages}>
      <OfflineAccessPanel />
    </IntlProvider>,
  );
}

describe('OfflineAccessPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    confirmDialogMock.mockReset();
    showToastSuccessMock.mockReset();
  });

  it('renders nothing until the roster state is known', () => {
    const { container } = render(
      <IntlProvider locale="es" messages={messages}>
        <OfflineAccessPanel />
      </IntlProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers activation on a device with no roster', async () => {
    renderPanel();

    expect(
      await screen.findByRole('button', { name: /activar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).not.toBeInTheDocument();
  });

  it('offers deactivation on a device that already has a roster', async () => {
    importRoster(makeBundle());
    renderPanel();

    expect(
      await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^activar acceso sin conexión$/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the activation dialog when activation is clicked', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /activar acceso sin conexión/i }));

    expect(await screen.findByLabelText(/contraseña de activación/i)).toBeInTheDocument();
  });

  it('clears the roster, flips the button and toasts once deactivation is confirmed', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(true);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(isRosterProvisioned()).toBe(false));
    expect(
      await screen.findByRole('button', { name: /activar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(showToastSuccessMock).toHaveBeenCalledWith('Acceso sin conexión desactivado.');
  });

  it('leaves the roster alone when deactivation is cancelled', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(isRosterProvisioned()).toBe(true);
    expect(
      screen.getByRole('button', { name: /desactivar acceso sin conexión/i }),
    ).toBeInTheDocument();
    expect(showToastSuccessMock).not.toHaveBeenCalled();
  });

  it('warns about unreadable data only when the device holds no key copy', async () => {
    importRoster(makeEncryptedBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].message).toContain('van a quedar ilegibles');
  });

  it('omits the data warning when the roster carries no encryption', async () => {
    importRoster(makeBundle());
    confirmDialogMock.mockResolvedValue(false);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: /desactivar acceso sin conexión/i }));

    await waitFor(() => expect(confirmDialogMock).toHaveBeenCalledTimes(1));
    expect(confirmDialogMock.mock.calls[0][0].message).not.toContain('ilegibles');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run app/auth/components/__tests__/offline-access-panel.test.tsx`
Expected: FAIL — `Failed to resolve import "../offline-access-panel"`.

- [ ] **Step 4: Write the implementation**

Create `app/auth/components/offline-access-panel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { confirmDialog } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { ImportRosterModal } from './import-roster-modal';

type RosterState = 'unknown' | 'provisioned' | 'absent';

/**
 * The login screen's offline-access control: one button, which one depending
 * on whether this device is activated.
 *
 * Every `offline/` and `storage/` module is reached through a dynamic
 * `import()` so `login.tsx` keeps zero static offline imports (design D4).
 * Reading roster state at render is the ONE deliberate exception to the
 * "an unprovisioned device is byte-for-byte unchanged" invariant: the button
 * cannot be chosen without the state it depends on.
 */
export function OfflineAccessPanel() {
  const intl = useIntl();
  const [rosterState, setRosterState] = useState<RosterState>('unknown');
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { isRosterProvisioned } = await import('~/shared/lib/offline/roster-store');
      if (!cancelled) {
        setRosterState(isRosterProvisioned() ? 'provisioned' : 'absent');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDisable() {
    const [{ isEncryptionProvisioned, clearRoster }, { hasDeviceDekWrap }] = await Promise.all([
      import('~/shared/lib/offline/roster-store'),
      import('~/shared/lib/storage/device-dek-table'),
    ]);

    // design D6: clearing the roster on a device that holds encrypted data
    // and NO device-level key copy makes that data permanently unreadable.
    // The persist that normally creates that copy is best-effort, so its
    // absence is rare, not impossible. Warn harder; never block.
    const dataAtRisk = isEncryptionProvisioned() && !hasDeviceDekWrap();

    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_TITLE' }),
      message: intl.formatMessage({
        id: dataAtRisk
          ? 'OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS'
          : 'OFFLINE_ACCESS.DISABLE_MESSAGE',
      }),
      confirmButtonText: intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_CONFIRM' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.CANCEL' }),
    });
    if (!confirmed) return;

    // The anti-replay marker survives this on purpose (roster-store.ts:174-181)
    // — which is exactly what the confirmation just told the user.
    clearRoster();
    setRosterState('absent');
    showToastSuccess(intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLED' }));
  }

  function handleImported() {
    setModalOpen(false);
    setRosterState('provisioned');
    showToastSuccess(intl.formatMessage({ id: 'OFFLINE_ACCESS.ENABLED' }));
  }

  // Renders nothing until the dynamic import resolves. The panel sits at the
  // very bottom of the login screen, so nothing above it shifts.
  if (rosterState === 'unknown') return null;

  return (
    <div className="mt-4 text-center">
      {rosterState === 'absent' ? (
        <Button type="button" variant="outline" onClick={() => setModalOpen(true)}>
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.ENABLE_BUTTON' })}
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={handleDisable}>
          {intl.formatMessage({ id: 'OFFLINE_ACCESS.DISABLE_BUTTON' })}
        </Button>
      )}

      {modalOpen && (
        <ImportRosterModal onImported={handleImported} onCancel={() => setModalOpen(false)} />
      )}
    </div>
  );
}

export default OfflineAccessPanel;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/auth/components/__tests__/offline-access-panel.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Render the panel on the login screen**

In `app/auth/routes/login.tsx`, add to the import block (lines 1-12):

```ts
import { OfflineAccessPanel } from '~/auth/components/offline-access-panel';
```

and insert the panel immediately after the existing "¿No tenés cuenta?" block that closes at line 283:

```tsx
      <div className="mt-6 text-center text-sm text-gray-600">
        {intl.formatMessage({ id: 'AUTH.NO_ACCOUNT' })}{' '}
        <Link to="/register" className="text-cyan-600 hover:text-cyan-700 font-medium">
          {intl.formatMessage({ id: 'AUTH.REGISTER' })}
        </Link>
      </div>

      <OfflineAccessPanel />
    </div>
  );
}
```

Change nothing else in this file. In particular, do not convert the dynamic `import('~/shared/lib/offline/roster-store')` at line 109 into a static import.

- [ ] **Step 7: Run the full unit gate**

Run: `npx turbo run test --force --filter=@store-mgmt/web-store-pos`
Expected: PASS. `login.offline.test.tsx`, `login.offline.e2e.test.tsx` and `roster-store.purity.test.ts` must all stay green — if any of them breaks, the panel is doing something at module load that it should be doing behind the dynamic import.

- [ ] **Step 8: Run typecheck and lint**

Run: `npx turbo run typecheck lint --force --filter=@store-mgmt/web-store-pos`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/auth/components/offline-access-panel.tsx app/auth/components/__tests__/offline-access-panel.test.tsx app/auth/routes/login.tsx app/shared/lib/i18n/es.ts
git commit -m "feat(auth): offer offline access activation and removal from the login screen"
```

---

### Task 5: The end-to-end proof

**Files:**
- Create: `frontend-react/e2e/offline-access-panel.spec.ts`

**Interfaces:**
- Consumes: the existing E2E harness under `e2e/support/`, read-only.
- Produces: nothing consumed by later tasks.

**This task is bounded by a hard rule.** Adding this **new** spec file is permitted. Reading `e2e/support/roster-fixture.ts` and `e2e/support/session.ts` to learn their helpers is permitted. **Modifying any existing spec or support file is not** — if the new spec appears to need a change to an existing support file, STOP and ask the user rather than editing it. A new support file for this spec alone is acceptable.

- [ ] **Step 1: Read the existing harness before writing anything**

Read `e2e/README.md`, `e2e/support/roster-fixture.ts` and `e2e/login-offline.spec.ts`. The last one already drives an offline login on a provisioned device and shows how the offline state is reached — this spec's job is to reach that same state **through the new UI** instead of through the fixture.

The support exports that matter, verified present:

| Export | Location | Use here |
|---|---|---|
| `buildRosterBundle(spec: RosterSpec)` | `roster-fixture.ts:255` | Builds a genuine bundle. **Use this.** |
| `plantRoster(page, spec)` | `roster-fixture.ts:289` | Seeds storage directly. **Do NOT use for the import** — it bypasses the UI this spec exists to test. Acceptable only to pre-provision the device for the deactivation half. |
| `KAT_PASSWORD` | `roster-fixture.ts:53` | The fixture's password constant. |
| `readSelectedStoreId(page)` | `session.ts:98` | Gets the store id the filename must carry. |
| `restoreSignedInSession`, `createPersonaCache` | `session.ts:488`, `:392` | Session setup, as in the existing specs. |

`roster-fixture.ts:279` states the fixture seeds storage directly, "never the `provision.tsx` round-trip". This spec is the first to exercise the real round-trip, so the file it attaches must be produced the way the export produces it — serialized with `serializeRoster(bundle, password, storeId)` and named exactly `roster-<storeId>.smcabundle`, because the dialog recovers the store id from that name (design D1). A filename that does not match yields the `UnknownFileError` message, not a password error — if the spec fails that way, the filename is wrong, not the app.

Attach the file with Playwright's `setInputFiles` against the hidden native input (`input[type="file"]`), passing `{ name, mimeType, buffer }`; `FileInput` hides that element behind a styled trigger button, so a click-based approach will not reach it.

- [ ] **Step 2: Write the spec**

Cover exactly this arc, in one test so the state flows:

1. Land on `/login` with no roster. Assert the **Activar acceso sin conexión** button is visible and that no deactivation button exists.
2. Click it. Assert the dialog shows the file and password fields.
3. Attach a genuine export file, type the password, submit. Assert the dialog closes.
4. Assert the button has flipped to **Desactivar acceso sin conexión**.
5. Sign in with the network cut, proving the import actually enabled offline authentication and not just a label change.
6. Return to `/login`, click **Desactivar**, accept the confirmation. Assert the button flips back to **Activar acceso sin conexión**.

Two traps documented in this repo that apply here:

- Cutting the network breaks Vite's dev module loading. Warm the destination route and assert the precondition **before** going offline; a route chunk that was never requested will hang forever.
- The dev backend writes to the `smca` database, not `smca_test`. Playwright runs leave state behind, so this spec must clean up whatever it seeds.

- [ ] **Step 3: Hand the run to the user**

Do **not** run Playwright. Commit the spec and tell the user the exact command to run, then wait for their output before claiming anything about it.

- [ ] **Step 4: Commit**

```bash
git add e2e/offline-access-panel.spec.ts
git commit -m "test(e2e): cover offline access activation and removal from the login screen"
```

---

## Definition of done

- [ ] `npx turbo run test --force --filter=@store-mgmt/web-store-pos` passes, including `roster-store.purity.test.ts`, `login.offline.test.tsx` and `provision.test.tsx`.
- [ ] `npx turbo run typecheck lint --force --filter=@store-mgmt/web-store-pos` passes.
- [ ] `git status` shows no modification to any file under `frontend-react/e2e/` other than the newly added spec.
- [ ] `grep -n "shared/lib/offline" app/auth/routes/login.tsx` returns only the dynamic `import()` on line 109.
- [ ] The user has run the new Playwright spec and reported the result. Until then, the end-to-end behaviour is **unverified** and must be described that way.
