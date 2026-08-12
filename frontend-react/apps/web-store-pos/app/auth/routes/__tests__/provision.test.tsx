import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { IntlProvider } from 'react-intl';
import messages from '~/shared/lib/i18n/es';
import Provision from '../provision';
import { serializeRoster } from '~/shared/lib/offline/roster-serializer';
import {
  getRoster,
  isRosterProvisioned,
  isEncryptionProvisioned,
  importRoster,
} from '~/shared/lib/offline/roster-store';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

function makeBundle(overrides: Partial<OfflineRosterBundle> = {}): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: Date.now() + 1_000_000,
    formatVersion: 1,
    storeId: 's1',
    users: [],
    ...overrides,
  };
}

function renderProvision() {
  return render(
    <IntlProvider locale="es" messages={messages}>
      <MemoryRouter>
        <Provision />
      </MemoryRouter>
    </IntlProvider>,
  );
}

async function selectFile(payload: Uint8Array, name = 'roster.smcabundle') {
  const file = new File([payload], name);
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fireEvent.change(fileInput);
}

async function fillAndSubmit(storeId: string, master: string) {
  fireEvent.change(screen.getByLabelText(/identificador de tienda/i), {
    target: { value: storeId },
  });
  fireEvent.change(screen.getByLabelText(/contraseña maestra/i), {
    target: { value: master },
  });
  fireEvent.click(screen.getByRole('button', { name: /activar/i }));
}

describe('Provision route (offline-device-provisioning spec)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('successfully imports a bundle and makes isRosterProvisioned() true', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'master', 's1');
    renderProvision();

    await selectFile(payload);
    await fillAndSubmit('s1', 'master');

    await waitFor(() => {
      expect(screen.getByText(/dispositivo activado/i)).toBeInTheDocument();
    });
    expect(getRoster()?.bundleId).toBe(bundle.bundleId);
    expect(isRosterProvisioned()).toBe(true);
  });

  // WU14 (regression coverage, not new behavior): the import flow itself
  // has nothing to do with encryption provisioning — same successful-import
  // case as above with a v2 bundle carrying wrap fields, additionally
  // asserting isEncryptionProvisioned() flips true (which the v1 case never
  // exercises).
  it('successfully imports a v2 bundle (with wrap fields) and makes both isRosterProvisioned() and isEncryptionProvisioned() true (WU14 regression coverage)', async () => {
    const bundle = makeBundle({
      formatVersion: 2,
      users: [
        {
          id: 'u1',
          login: 'ana',
          fullName: 'Ana',
          isActive: true,
          roles: [],
          featureIds: [],
          storeModuleIds: [],
          isSuperAdmin: false,
          isOwnerAdmin: false,
          isReSeller: false,
          selectedStoreId: 's1',
          verifier: { hash: 'h', salt: 's', iterations: 210_000 },
          wrappedDek: 'ct',
          wrapSalt: 'salt',
          wrapIv: 'iv',
        },
      ],
    });
    const payload = await serializeRoster(bundle, 'master', 's1');
    renderProvision();

    await selectFile(payload);
    await fillAndSubmit('s1', 'master');

    await waitFor(() => {
      expect(screen.getByText(/dispositivo activado/i)).toBeInTheDocument();
    });
    expect(getRoster()?.bundleId).toBe(bundle.bundleId);
    expect(isRosterProvisioned()).toBe(true);
    expect(isEncryptionProvisioned()).toBe(true);
  });

  it('shows a wrong-master-password-specific message and imports nothing', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'master', 's1');
    renderProvision();

    await selectFile(payload);
    await fillAndSubmit('s1', 'incorrect-master');

    await waitFor(() => {
      expect(screen.getByText('La contraseña de activación es incorrecta.')).toBeInTheDocument();
    });
    expect(getRoster()).toBeNull();
  });

  it('shows a corrupt-file-specific message', async () => {
    renderProvision();

    await selectFile(new Uint8Array([1, 2, 3, 4, 5]));
    await fillAndSubmit('s1', 'master');

    await waitFor(() => {
      expect(
        screen.getByText('El archivo está dañado o no tiene un formato válido.'),
      ).toBeInTheDocument();
    });
    expect(getRoster()).toBeNull();
  });

  it('shows an already-expired-bundle-specific message', async () => {
    const bundle = makeBundle({ expiresAt: Date.now() - 1000 });
    const payload = await serializeRoster(bundle, 'master', 's1');
    renderProvision();

    await selectFile(payload);
    await fillAndSubmit('s1', 'master');

    await waitFor(() => {
      expect(
        screen.getByText('Este archivo de activación ya venció. Pedile uno nuevo al administrador.'),
      ).toBeInTheDocument();
    });
    expect(getRoster()).toBeNull();
  });

  it('shows a replay-specific message and leaves the previously stored roster unchanged', async () => {
    const bundle = makeBundle();
    importRoster(bundle);
    const payload = await serializeRoster(bundle, 'master', 's1');
    renderProvision();

    await selectFile(payload);
    await fillAndSubmit('s1', 'master');

    await waitFor(() => {
      expect(
        screen.getByText('Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.'),
      ).toBeInTheDocument();
    });
    expect(getRoster()?.bundleId).toBe(bundle.bundleId);
  });
});
