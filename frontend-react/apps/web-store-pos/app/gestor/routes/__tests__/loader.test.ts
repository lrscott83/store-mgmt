import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authLoader: vi.fn(),
  resolveUserHomePath: vi.fn(),
  getState: vi.fn(),
  redirect: vi.fn((url: string) => ({ status: 302, url })),
}));

vi.mock('~/auth/routes/loaders', () => ({ authLoader: mocks.authLoader }));
vi.mock('~/shared/lib/auth/user-home', () => ({
  resolveUserHomePath: mocks.resolveUserHomePath,
}));
vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: { getState: mocks.getState },
}));
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, redirect: mocks.redirect };
});

import { gestorLoader } from '../loader';

type GestorUser = { isGestorVentas?: boolean; selectedStoreId?: string };

function state(user: GestorUser | null) {
  mocks.getState.mockReturnValue({ user });
}

describe('gestorLoader — guard del portal del gestor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authLoader.mockResolvedValue(null);
    mocks.resolveUserHomePath.mockResolvedValue('/sales/new');
  });

  it('respeta la denegación de authLoader (sin sesión / sin DEK)', async () => {
    const denial = { status: 302, url: '/login' };
    mocks.authLoader.mockResolvedValue(denial);

    await expect(gestorLoader()).resolves.toBe(denial);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('deja pasar a un gestor autenticado', async () => {
    state({ isGestorVentas: true });

    await expect(gestorLoader()).resolves.toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('manda a un autenticado que no es gestor a SU home, sin cerrar la sesión', async () => {
    state({ isGestorVentas: false });

    await expect(gestorLoader()).resolves.toEqual({ status: 302, url: '/sales/new' });
    expect(mocks.resolveUserHomePath).toHaveBeenCalledWith(
      expect.objectContaining({ isGestorVentas: false }),
    );
  });

  it('sin usuario en el store cae a /login', async () => {
    state(null);

    await expect(gestorLoader()).resolves.toEqual({ status: 302, url: '/login' });
  });
});
