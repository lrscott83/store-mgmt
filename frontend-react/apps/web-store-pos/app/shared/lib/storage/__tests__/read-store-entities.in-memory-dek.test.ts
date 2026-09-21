// Regresión (bug "multi-tienda: todas las tiendas vacías", 2026-09-20).
//
// El DEK en memoria pertenece a la tienda de la SESIÓN (`getDekStoreId()`), que
// es la clave con la que los servicios single-store leen y escriben ESA tienda.
// El `storeId` del device-dek table es solo la ETIQUETA del wrap activo y puede
// legítimamente diferir de la tienda de la sesión (ver `dek-bootstrap.test.ts`
// "already unlocked this page load", que escribe una tabla apuntando a OTRA
// tienda; y `dek-provisioning.ts:430-436`, que documenta que la sesión escribe
// por `getDekStoreId()` mientras el próximo reload re-etiqueta por
// `table.storeId`). El lector multi-tienda resolvía el DEK SOLO por
// `table.storeId`, así que con la etiqueta divergente caía a `null`, la lectura
// cifrada fallaba en silencio y TODOS los paneles mostraban "sin datos" — incluso
// la tienda seleccionada. Estos tests fijan que el DEK en memoria para su propia
// tienda es autoritativo, sin re-derivación.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDeviceKeyMock = vi.fn<() => Promise<CryptoKey | null>>();

vi.mock('../device-key-store', () => ({
  getDeviceKey: (...args: unknown[]) => getDeviceKeyMock(...(args as [])),
  getOrCreateDeviceKey: vi.fn(),
  deleteDeviceKey: vi.fn(),
  DEVICE_KEY_DB: 'lizoft-device-key',
  DEVICE_KEY_STORE: 'keys',
  DEVICE_KEY_ID: 'device-dek-key',
}));

import { clearDek, getDek, setDek } from '../data-key-store';
import { unwrapStoreDekForStore } from '../read-store-entities';
import { writeDeviceDekTable } from '../device-dek-table';

describe('unwrapStoreDekForStore — DEK en memoria autoritativo para su tienda', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    getDeviceKeyMock.mockReset();
    getDeviceKeyMock.mockResolvedValue(null);
  });

  it('devuelve el DEK en memoria aunque el device-dek table esté etiquetado con OTRA tienda', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'selected-store');
    // La etiqueta del wrap activo quedó en una tienda distinta (estado que el
    // propio bootstrap admite: `dek-bootstrap.test.ts` lo usa para probar su
    // early-return). La sesión sigue siendo la de `selected-store`.
    writeDeviceDekTable({
      formatVersion: 2,
      dekSource: 'roster',
      storeId: 'legacy-label-store',
      device: null,
      users: {},
      stores: {},
    });

    await expect(unwrapStoreDekForStore('selected-store')).resolves.toBe(dek);
  });

  it('devuelve el DEK en memoria aunque no exista ningún device-dek table', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'selected-store');

    await expect(unwrapStoreDekForStore('selected-store')).resolves.toBe(dek);
  });

  it('sigue devolviendo null para OTRA tienda sin wrap ni DEK en memoria que le corresponda', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    setDek(dek, 'selected-store');

    await expect(unwrapStoreDekForStore('other-store')).resolves.toBeNull();
  });

  it('sin DEK en memoria ni tabla sigue devolviendo null', async () => {
    await expect(unwrapStoreDekForStore('selected-store')).resolves.toBeNull();
    expect(getDek()).toBeNull();
  });
});
