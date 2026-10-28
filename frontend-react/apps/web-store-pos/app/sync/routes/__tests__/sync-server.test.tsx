/**
 * sync/server route — the backend repository of encrypted backups.
 *
 * Pins the screen contract: newest first, store + uploader + download count,
 * the informative "downloaded by me" badge, the empty-password guard, the
 * download+import that always targets the file's own store (S7), and the
 * confirmed delete (S8).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { WrongPasswordError } from '~/sync/lib/services/data-serializer-service';

import { SyncServerPage, clientLoader } from '../sync-server';

vi.mock('~/shared/lib/stores/auth-store', () => {
  const state = {
    user: {
      selectedStoreId: 'store-s1',
      isSuperAdmin: true,
      isOwnerAdmin: false,
      isReSeller: false,
      id: 'u1',
      login: 'user@test.com',
      fullName: 'Test User',
      cellPhone: '+1',
      email: 'user@test.com',
      isActive: true,
      password: '',
      authToken: 'tok',
      refreshToken: 'ref',
      expiresIn: Date.now() + 1_000_000,
      roles: [],
      featureIds: [],
      storeModuleIds: [],
    },
    isAuthenticated: true,
    logout: () => {},
  };
  const useAuthStore = vi.fn((selector?: (s: typeof state) => unknown) => {
    if (typeof selector === 'function') return selector(state);
    return state;
  });
  (useAuthStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useAuthStore };
});

vi.mock('~/sync/lib/services/store-sync-file-http-service', () => ({
  listStoreSyncFiles: vi.fn(),
  uploadStoreBackups: vi.fn(),
  downloadStoreSyncFile: vi.fn(),
  deleteStoreSyncFile: vi.fn(),
}));

vi.mock('~/sync/lib/services/multi-store-backup-service', () => ({
  importBackupFile: vi.fn(),
  resolveBackupStoreIds: vi.fn(() => []),
}));

vi.mock('~/shared/lib/storage/read-store-entities', () => ({
  getStoresWithLocalDek: vi.fn(() => []),
  unwrapStoreDekForStore: vi.fn(async () => null),
}));

vi.mock('~/shared/lib/storage/data-key-store', () => ({
  withStoreDek: vi.fn(
    async (_storeId: string, _dek: Uint8Array, run: () => Promise<unknown>) => run(),
  ),
}));

vi.mock('~/sales/lib/services/order-offline-service', () => ({
  OrderOfflineService: vi.fn().mockImplementation(() => ({ getStorageOrders: () => [] })),
}));

vi.mock('~/expenses/lib/services/expense-offline-service', () => ({
  ExpenseOfflineService: vi.fn().mockImplementation(() => ({ getStorageExpenses: () => [] })),
}));

vi.mock('~/sales/lib/services/sale-credit-offline-service', () => ({
  SaleCreditOfflineService: vi.fn().mockImplementation(() => ({ getStorageSaleCredits: () => [] })),
}));

function file(overrides: Record<string, unknown>) {
  return {
    id: 'f1',
    storeId: 'store-s1',
    storeName: 'Tienda',
    fileName: 'datos261027-1234.zip',
    sizeBytes: 1024,
    uploadedByUserId: 'u1',
    uploadedByFullName: 'Ana Pérez',
    createdAt: '2026-10-27T12:00:00Z',
    downloadCount: 0,
    downloadedByMe: false,
    downloadedByMeAt: null,
    ...overrides,
  };
}

const OLDER = file({
  id: 'f-old',
  storeName: 'Tienda Centro',
  uploadedByFullName: 'Ana Pérez',
  createdAt: '2026-10-25T09:00:00Z',
  downloadCount: 2,
});
const NEWEST = file({
  id: 'f-new',
  storeName: 'Tienda Norte',
  uploadedByFullName: 'Luis Gómez',
  createdAt: '2026-10-27T12:00:00Z',
  downloadCount: 7,
  downloadedByMe: true,
  downloadedByMeAt: '2026-10-27T13:00:00Z',
});
const MIDDLE = file({
  id: 'f-mid',
  storeName: 'Tienda Sur',
  uploadedByFullName: 'Marta Díaz',
  createdAt: '2026-10-26T10:00:00Z',
  downloadCount: 0,
});

function success<T>(data: T) {
  return { succeeded: true as const, data, message: null, actionCode: null, errors: [] };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('sync/server route loader', () => {
  it('is exported and gated by the sync features', () => {
    expect(typeof clientLoader).toBe('function');
  });

  it('redirects to /login when the user lacks both Send and Receive', async () => {
    const { useAuthStore } = await import('~/shared/lib/stores/auth-store');
    const restrictedState = {
      user: {
        selectedStoreId: 'store-s1',
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        id: 'u2',
        login: 'user@test.com',
        fullName: 'Test User',
        cellPhone: '+1',
        email: 'user@test.com',
        isActive: true,
        password: '',
        authToken: 'tok',
        refreshToken: 'ref',
        expiresIn: Date.now() + 1_000_000,
        roles: [{ storeId: 'store-s1', storeName: 'S1', moduleId: 1, featureIds: [99] }],
        featureIds: [],
        storeModuleIds: [],
      },
      isAuthenticated: true,
      logout: () => {},
    };
    (useAuthStore as unknown as { getState: () => typeof restrictedState }).getState = () =>
      restrictedState;

    const result = await clientLoader({ params: {} } as never);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get('Location')).toBe('/login');
  });
});

describe('SyncServerPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const service = await import('~/sync/lib/services/store-sync-file-http-service');
    // Deliberately out of order: the screen must render newest first.
    vi.mocked(service.listStoreSyncFiles).mockResolvedValue(success([OLDER, NEWEST, MIDDLE]) as never);
    vi.mocked(service.uploadStoreBackups).mockResolvedValue([]);
  });

  it('lists the files newest first', async () => {
    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );

    const rows = await screen.findAllByTestId(/^sync-file-row-/);
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'sync-file-row-f-new',
      'sync-file-row-f-mid',
      'sync-file-row-f-old',
    ]);
  });

  it('shows the store, the uploader full name and the download count', async () => {
    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );

    expect(await screen.findByText('Tienda Norte')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getByTestId('sync-file-downloads-f-new')).toHaveTextContent('7');
  });

  it('marks the file this user already downloaded, without hiding it', async () => {
    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );

    const badge = await screen.findByTestId('sync-file-downloaded-f-new');
    expect(badge).toHaveTextContent(/Descargado el/);
    expect(screen.queryByTestId('sync-file-downloaded-f-old')).toBeNull();
    expect(screen.getByTestId('sync-file-download-f-new')).toBeInTheDocument();
  });

  it('blocks the upload when the password is empty', async () => {
    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );

    await screen.findByTestId('sync-file-row-f-new');
    fireEvent.click(screen.getByRole('button', { name: 'Subir al servidor' }));

    expect(await screen.findByText('La contraseña no puede estar vacía.')).toBeInTheDocument();
    const { uploadStoreBackups } = await import(
      '~/sync/lib/services/store-sync-file-http-service'
    );
    expect(uploadStoreBackups).not.toHaveBeenCalled();
  });
});

const OTHER_STORE = file({
  id: 'f-other',
  storeId: 'store-s2',
  storeName: 'Tienda Este',
  createdAt: '2026-10-24T08:00:00Z',
});
const PAYLOAD = new Uint8Array([80, 75, 3, 4]);

describe('SyncServerPage — download + import (S7)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const service = await import('~/sync/lib/services/store-sync-file-http-service');
    const backup = await import('~/sync/lib/services/multi-store-backup-service');
    const storage = await import('~/shared/lib/storage/read-store-entities');

    vi.mocked(service.listStoreSyncFiles).mockResolvedValue(success([OTHER_STORE]) as never);
    vi.mocked(service.downloadStoreSyncFile).mockResolvedValue(PAYLOAD as never);
    vi.mocked(backup.importBackupFile).mockResolvedValue({
      succeeded: true,
      errors: [],
      merges: [],
    } as never);
    vi.mocked(storage.unwrapStoreDekForStore).mockResolvedValue(null);
  });

  async function openDialog() {
    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );
    fireEvent.click(await screen.findByTestId('sync-file-download-f-other'));
  }

  it("downloads the bytes and imports them into the file own store, not the selected one", async () => {
    const service = await import('~/sync/lib/services/store-sync-file-http-service');
    const backup = await import('~/sync/lib/services/multi-store-backup-service');

    await openDialog();
    fireEvent.change(screen.getByLabelText('Contraseña de cifrado', { selector: '#sync-server-import-password' }), {
      target: { value: 'clave-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() => expect(backup.importBackupFile).toHaveBeenCalledTimes(1));
    expect(service.downloadStoreSyncFile).toHaveBeenCalledWith('f-other');
    expect(backup.importBackupFile).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: PAYLOAD,
        password: 'clave-123',
        selectedStoreId: 'store-s2',
      }),
    );
    expect(await screen.findByText('El respaldo se importó correctamente.')).toBeInTheDocument();
  });

  it('runs the import under the file store key when this device holds it', async () => {
    const storage = await import('~/shared/lib/storage/read-store-entities');
    const keyStore = await import('~/shared/lib/storage/data-key-store');
    const dek = new Uint8Array([7, 7, 7]);
    vi.mocked(storage.unwrapStoreDekForStore).mockResolvedValue(dek);

    await openDialog();
    fireEvent.change(screen.getByLabelText('Contraseña de cifrado', { selector: '#sync-server-import-password' }), {
      target: { value: 'clave-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    await waitFor(() =>
      expect(keyStore.withStoreDek).toHaveBeenCalledWith('store-s2', dek, expect.any(Function)),
    );
  });

  it('shows the wrong-password message instead of a generic import failure', async () => {
    const backup = await import('~/sync/lib/services/multi-store-backup-service');
    vi.mocked(backup.importBackupFile).mockRejectedValue(new WrongPasswordError());

    await openDialog();
    fireEvent.change(screen.getByLabelText('Contraseña de cifrado', { selector: '#sync-server-import-password' }), {
      target: { value: 'incorrecta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));

    expect(
      await screen.findByText('La contraseña del respaldo no es correcta.'),
    ).toBeInTheDocument();
  });
});

describe('SyncServerPage — delete (S8)', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const service = await import('~/sync/lib/services/store-sync-file-http-service');
    vi.mocked(service.listStoreSyncFiles).mockResolvedValue(success([OTHER_STORE]) as never);
    vi.mocked(service.deleteStoreSyncFile).mockResolvedValue(success(undefined) as never);
  });

  it('deletes only after confirmation and reloads the list', async () => {
    const service = await import('~/sync/lib/services/store-sync-file-http-service');

    render(
      <Wrapper>
        <SyncServerPage />
      </Wrapper>,
    );

    fireEvent.click(await screen.findByTestId('sync-file-delete-f-other'));
    expect(service.deleteStoreSyncFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(service.deleteStoreSyncFile).toHaveBeenCalledWith('f-other'));
    expect(await screen.findByText('Archivo borrado del servidor.')).toBeInTheDocument();
    expect(service.listStoreSyncFiles).toHaveBeenCalledTimes(2);
  });
});
