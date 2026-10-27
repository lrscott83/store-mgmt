import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

/**
 * Arnés compartido de las pruebas de rutas ONAT.
 *
 * Las dos pantallas (Vector Fiscal y Configuraciones) comparten el mismo guard:
 * `ownerOnlyLoader` más el módulo ONAT (22). Leen la sesión por `useAuthStore`,
 * así que duplicaban el mock del store, la sesión mutable y las pruebas de
 * denegación del loader. Aquí viven una sola vez; un cambio en el contrato del
 * guard se prueba en un único sitio.
 */

/** Sesión mutable: el loader y las páginas leen la misma sesión que en la app. */
const hoistedSession = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

// El plugin de Vitest no permite exportar directamente el resultado de
// `vi.hoisted`; se expone la misma referencia desde una constante normal.
export const session = hoistedSession;

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector?: (state: { user: UserModel | null }) => unknown) =>
      selector ? selector({ user: hoistedSession.user }) : { user: hoistedSession.user },
    ),
    {
      getState: () => ({
        user: hoistedSession.user,
        isAuthenticated: hoistedSession.user !== null,
        logout: hoistedSession.logout,
      }),
    },
  ),
}));

/**
 * Owner autenticado por defecto; cada prueba ajusta solo lo que le importa.
 * Trae el módulo ONAT (22) en `storeModuleIds` para que el guard deje pasar al
 * Owner: sin él la vista está apagada a propósito (el módulo nace inactivo y
 * `/me` no lo devuelve). Una prueba que quiera el Owner SIN el módulo pasa
 * `storeModuleIds: []`.
 */
export function makeUser(overrides: Partial<UserModel> = {}): UserModel {
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
    storeModuleIds: [EModules.Onat],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    storeList: [{ id: 's1', name: 'Mi tienda', isActive: true }],
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

/** Estado limpio entre pruebas: sin sesión y sin llamadas del logout anterior. */
export function resetOnatRouteSession(): void {
  session.user = null;
}

/** Renderiza una página ONAT con el catálogo de mensajes en español. */
export function renderWithIntl(ui: ReactElement) {
  // Sin JSX: el arnés es un `.ts` para que Vitest no lo recoja como suite.
  return render(createElement(IntlProvider, { locale: 'es', messages: esMessages }, ui));
}

/**
 * Pruebas compartidas del guard "solo el Owner" (S2): deja pasar al Owner y
 * deniega con logout + redirección a cualquier otro rol o a una sesión vacía.
 */
export function describeOwnerOnlyLoader(
  title: string,
  loader: () => Response | null | Promise<Response | null>,
): void {
  describe(title, () => {
    it('deja pasar al Owner', async () => {
      session.user = makeUser();

      await expect(loader()).resolves.toBeNull();
    });

    it('desloguea a un usuario de tienda', async () => {
      session.user = makeUser({ isOwnerAdmin: false });

      const result = await loader();

      expect(session.logout).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
    });

    it('desloguea al SuperAdmin aunque también sea OwnerAdmin', async () => {
      session.user = makeUser({ isSuperAdmin: true, isOwnerAdmin: true });

      const result = await loader();

      expect(session.logout).toHaveBeenCalled();
      expect((result as Response).status).toBe(302);
    });

    it('desloguea a una sesión sin autenticar', async () => {
      session.user = null;

      const result = await loader();

      expect(session.logout).toHaveBeenCalled();
      expect((result as Response).status).toBe(302);
    });
  });
}
