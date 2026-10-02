// Inventario Disponible — layout de la fila GLOBAL multi-tienda (select de tiendas +
// buscador). Sin mocks de datos: mismo arnés de DEK/localStorage que el test de
// integración, porque lo que se verifica es estructura de DOM, no contenido.
//
// Contexto (2026-10-02): el buscador y el select compartían fila solo en escritorio.
// El buscador pedía un ancho FIJO (`w-64`), que a width de teléfono no cabía junto al
// select, así que `flex-wrap` los partía en dos filas. Estos tests fijan el contrato que
// lo evita: ambos como hijos DIRECTOS de la misma fila, con el buscador como ítem flex
// que cede espacio en vez de reservarlo.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EModules } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { StorageKeys } from '~/shared/lib/storage/storage-keys';
import { writeDeviceDekTable } from '~/shared/lib/storage/device-dek-table';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
// La hidratación real del auth-store deja una cola fire-and-forget (/me en background).
import { allowUnmockedHttpReporting } from '~/shared/lib/testing/block-real-http';
allowUnmockedHttpReporting();
import { InventoryAvailablePage } from '~/inventory/routes/available';

const STORE_ID = 's1';

function ownerUser(): UserModel {
  return {
    id: 'user-1',
    login: 'owner',
    firstName: 'Owner',
    lastName: 'Test',
    email: '',
    activated: true,
    langKey: 'es',
    imageUrl: '',
    activatedBy: '',
    resetDate: null as unknown as string,
    resetKey: null as unknown as string,
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    isDemo: false,
    expiresIn: Date.now() + 60 * 60 * 1000,
    selectedStoreId: STORE_ID,
    storeList: [
      { id: STORE_ID, name: 'Tienda A', isActive: true },
      { id: 's2', name: 'Tienda B', isActive: true },
    ],
    storeModuleIds: [EModules.MultiStores],
    featureIds: [],
    roles: [STORE_ID, 's2'].map((id) => ({ storeId: id, featureIds: [] })),
  } as unknown as UserModel;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('Inventario Disponible — fila global multi-tienda', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    setDek(crypto.getRandomValues(new Uint8Array(32)), STORE_ID);
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: STORE_ID,
      device: null,
      users: {},
    });
    const user = ownerUser();
    localStorage.setItem(
      StorageKeys.AUTH_MODEL,
      JSON.stringify({ authToken: 'test-token', expiresIn: user.expiresIn }),
    );
    localStorage.setItem(StorageKeys.CURRENT_USER, JSON.stringify(user));
    void useAuthStore.getState().getUserByToken();
  });

  afterEach(() => clearDek());

  it('el buscador y el select de tiendas son hijos directos de la MISMA fila', async () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    const select = await screen.findByTestId('multistore-select');
    const search = screen.getByTestId('multistore-inventory-search');
    // El buscador va envuelto en el div `relative` que ancla el icono de la lupa.
    const searchWrapper = search.parentElement;
    const row = select.parentElement;

    expect(row).not.toBeNull();
    expect(searchWrapper).not.toBeNull();
    // Sin este parentesco el buscador queda fuera de la fila y no puede compartir línea.
    expect(searchWrapper!.parentElement).toBe(row);
    expect(row!.contains(search)).toBe(true);
  });

  it('el buscador cede espacio en móvil en vez de reservar un ancho fijo', async () => {
    render(
      <Wrapper>
        <InventoryAvailablePage />
      </Wrapper>,
    );

    const searchWrapper = (await screen.findByTestId('multistore-inventory-search')).parentElement;
    expect(searchWrapper).not.toBeNull();

    // `flex-1` + `min-w-0`: el campo crece con el espacio sobrante y se encoge por debajo
    // del contenido. Ese es el mecanismo que evita el salto de línea en móvil.
    expect(searchWrapper).toHaveClass('flex-1');
    expect(searchWrapper).toHaveClass('min-w-0');

    // Y desde `sm` recupera el ancho fijo de escritorio, que es el tamaño pedido.
    expect(searchWrapper).toHaveClass('sm:w-72');
    expect(searchWrapper).toHaveClass('sm:flex-none');
  });
});