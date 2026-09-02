import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    expect(await screen.findByText('Elige el archivo de activación.')).toBeInTheDocument();
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

  it('keeps the file and lets the user retry with the correct password after a wrong one', async () => {
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
    // Direct proof the password survives the failed attempt — asserted BEFORE
    // the retry re-types the field, otherwise the retry's own change event
    // would mask a catch that cleared it.
    expect(
      (screen.getByLabelText(/contraseña de activación/i) as HTMLInputElement).value,
    ).toBe('incorrect');

    // Retry with only the password corrected — the file is NOT re-selected.
    // This proves the chosen file survives a failed attempt: if it were
    // dropped in the catch, this second submit would fail too.
    typePasswordAndSubmit('master');

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('imports a renamed file — the name carries no contract anymore', async () => {
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const { onImported } = renderModal();

    selectFile(payload, 'activacion.smcabundle');
    typePasswordAndSubmit('master');

    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(getRoster()?.bundleId).toBe('b1');
  });

  it('shows the unknown-file message for a zip without the activation envelope', async () => {
    // A roster.json-only zip is NOT an activation export — the failure must
    // stay diagnosable instead of degrading into a wrong-password blame.
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const { ZipWriter, BlobWriter, TextReader, BlobReader, ZipReader, TextWriter } = await import(
      '@zip.js/zip.js'
    );
    const reader = new ZipReader(new BlobReader(new Blob([payload])));
    const entries = await reader.getEntries();
    const rosterEntry = entries.find((e) => !e.directory && e.filename === 'roster.json');
    if (!rosterEntry || rosterEntry.directory) {
      throw new Error('fixture setup: serialized archive is missing roster.json');
    }
    const rosterText = await rosterEntry.getData(new TextWriter(), {
      password: `master${STORE_ID}`,
    });
    await reader.close();
    const writer = new ZipWriter(new BlobWriter('application/zip'));
    await writer.add('roster.json', new TextReader(rosterText));
    const noEnvelope = new Uint8Array(await (await writer.close()).arrayBuffer());

    renderModal();

    selectFile(noEnvelope, 'activacion.smcabundle');
    typePasswordAndSubmit('master');

    expect(
      await screen.findByText(
        'No pudimos reconocer el archivo. No parece un archivo de activación exportado por el sistema.',
      ),
    ).toBeInTheDocument();
    expect(getRoster()).toBeNull();
  });

  it('calls onCancel when the user cancels', () => {
    const { onCancel } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ImportRosterModal — roster-import chunk fails to load (Finding 2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.doUnmock('~/shared/lib/offline/roster-import');
    vi.resetModules();
  });

  it('shows the recoverable-error message and re-enables the controls instead of staying stuck busy', async () => {
    vi.resetModules();
    vi.doMock('~/shared/lib/offline/roster-import', () => {
      throw new Error('chunk load failed');
    });

    const { ImportRosterModal: FreshModal } = await import('../import-roster-modal');
    const payload = await serializeRoster(makeBundle(), 'master', STORE_ID);
    const onImported = vi.fn();
    const onCancel = vi.fn();
    render(
      <IntlProvider locale="es" messages={messages}>
        <FreshModal onImported={onImported} onCancel={onCancel} />
      </IntlProvider>,
    );

    selectFile(payload);
    typePasswordAndSubmit('master');

    expect(
      await screen.findByText(
        'No pudimos completar la acción. Recarga la página e intenta de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();

    // Not stuck busy: every control is usable again.
    expect(screen.getByLabelText(/contraseña de activación/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /cancelar/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /^activar$/i })).not.toBeDisabled();
  });
});
