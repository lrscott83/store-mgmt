import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { MENU_GROUPS } from '~/shared/lib/config/menu-config';
import { getOnatConfig, saveOnatConfig } from '~/onat/lib/onat-storage';

/** Sesión mutable: el loader y la página leen la misma sesión que en la app. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector?: (state: { user: UserModel | null }) => unknown) =>
      selector ? selector({ user: session.user }) : { user: session.user },
    ),
    {
      getState: () => ({
        user: session.user,
        isAuthenticated: session.user !== null,
        logout: session.logout,
      }),
    },
  ),
}));

import { OnatConfigurationsPage, clientLoader } from '../configurations';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner@test.com',
    fullName: 'Owner',
    cellPhone: '+1234567890',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <OnatConfigurationsPage />
    </IntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('clientLoader de Configuraciones ONAT (solo el Owner)', () => {
  it('deja pasar al Owner', async () => {
    session.user = makeUser();

    await expect(clientLoader()).resolves.toBeNull();
  });

  it('desloguea a un usuario de tienda', async () => {
    session.user = makeUser({ isOwnerAdmin: false });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('desloguea al SuperAdmin aunque también sea OwnerAdmin', async () => {
    session.user = makeUser({ isSuperAdmin: true, isOwnerAdmin: true });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
  });

  it('desloguea a una sesión sin autenticar', async () => {
    session.user = null;

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
  });
});

describe('Configuraciones del Vector Fiscal (S11)', () => {
  it('carga la configuración guardada del Owner', () => {
    session.user = makeUser();
    saveOnatConfig({
      ownerId: 'u1',
      nombre: 'Panadería La Esquina',
      nit: '1234567890123',
      domicilioFiscal: 'Calle 1 # 2',
      domicilioLegal: 'Calle 3 # 4',
      municipio: 'Centro Habana',
      provincia: 'La Habana',
      actividades: [{ nombre: 'Elaboración de pan', codigo: '1071' }],
    });

    renderPage();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Panadería La Esquina');
    expect(screen.getByLabelText('NIT')).toHaveValue('1234567890123');
    expect(screen.getByLabelText('Domicilio fiscal')).toHaveValue('Calle 1 # 2');
    expect(screen.getByLabelText('Domicilio legal')).toHaveValue('Calle 3 # 4');
    expect(screen.getByLabelText('Municipio')).toHaveValue('Centro Habana');
    expect(screen.getByLabelText('Provincia')).toHaveValue('La Habana');
    expect(screen.getByLabelText('Nombre de la actividad')).toHaveValue('Elaboración de pan');
    expect(screen.getByLabelText('Código de la actividad')).toHaveValue('1071');
  });

  it('persiste los datos y las actividades escritos por el Owner', () => {
    session.user = makeUser();

    renderPage();

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Panadería La Esquina' },
    });
    fireEvent.change(screen.getByLabelText('NIT'), { target: { value: '1234567890123' } });
    fireEvent.change(screen.getByLabelText('Domicilio fiscal'), {
      target: { value: 'Calle 1 # 2' },
    });
    fireEvent.change(screen.getByLabelText('Domicilio legal'), {
      target: { value: 'Calle 3 # 4' },
    });
    fireEvent.change(screen.getByLabelText('Municipio'), { target: { value: 'Centro Habana' } });
    fireEvent.change(screen.getByLabelText('Provincia'), { target: { value: 'La Habana' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    fireEvent.change(screen.getByLabelText('Nombre de la actividad'), {
      target: { value: 'Elaboración de pan' },
    });
    fireEvent.change(screen.getByLabelText('Código de la actividad'), {
      target: { value: '1071' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByRole('status')).toHaveTextContent('Configuración guardada.');
    expect(getOnatConfig('u1')).toEqual({
      ownerId: 'u1',
      nombre: 'Panadería La Esquina',
      nit: '1234567890123',
      domicilioFiscal: 'Calle 1 # 2',
      domicilioLegal: 'Calle 3 # 4',
      municipio: 'Centro Habana',
      provincia: 'La Habana',
      actividades: [{ nombre: 'Elaboración de pan', codigo: '1071' }],
    });
  });

  it('permite quitar una actividad agregada', () => {
    session.user = makeUser();

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar actividad' }));
    expect(screen.getAllByLabelText('Nombre de la actividad')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[1]);

    expect(screen.getAllByLabelText('Nombre de la actividad')).toHaveLength(1);
  });
});

describe('menú ONAT (S1)', () => {
  it('coloca el grupo Onat inmediatamente antes de Gestión', () => {
    const labels = MENU_GROUPS.map((group) => group.groupLabel);

    expect(labels).toContain('MENU.ONAT');
    expect(labels.indexOf('MENU.ONAT')).toBe(labels.indexOf('MENU.MANAGEMENT') - 1);
  });

  it('ofrece Vector Fiscal y Configuraciones solo al Owner', () => {
    const group = MENU_GROUPS.find((candidate) => candidate.groupLabel === 'MENU.ONAT');

    expect(group).toBeDefined();
    const items = group?.items ?? [];
    expect(items.map((item) => item.path)).toEqual([
      '/onat/vector-fiscal',
      '/onat/configurations',
    ]);

    const owner = makeUser();
    const superAdmin = makeUser({ isSuperAdmin: true, isOwnerAdmin: true });
    const storeUser = makeUser({ isOwnerAdmin: false });

    for (const item of items) {
      expect(item.featureIds).toBeUndefined();
      expect(item.moduleId).toBeUndefined();
      expect(Object.keys(item)).not.toContain('icon');
      expect(item.rolesOnly?.(owner)).toBe(true);
      expect(item.rolesOnly?.(superAdmin)).toBe(false);
      expect(item.rolesOnly?.(storeUser)).toBe(false);
    }
  });
});
