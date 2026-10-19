import { describe, expect, it } from 'vitest';
import { makeStore } from '~/sales/components/__tests__/store-fixture';
import { toStorePassThrough, toStoredLocationPayload } from '../store-location-payload';

describe('store-location-payload — proyecciones compartidas del PUT', () => {
  it('proyecta el bloque guardado: null → undefined y una coordenada 0 se conserva', () => {
    const store = makeStore({
      publicPhone: null,
      addressCity: 'La Habana',
      addressProvince: null,
      latitude: 0,
      longitude: -82.38,
      openingHours: [{ day: 'Monday', opens: '09:00', closes: '17:00' }],
    });

    expect(toStoredLocationPayload(store)).toEqual({
      publicPhone: undefined,
      addressCity: 'La Habana',
      addressProvince: undefined,
      latitude: 0,
      longitude: -82.38,
      openingHours: [{ day: 'Monday', opens: '09:00', closes: '17:00' }],
    });
  });

  it('proyecta solo los datos de tienda que el panel no edita', () => {
    const store = makeStore({ name: 'Store X', address: 'Calle 9', description: 'D' });

    expect(toStorePassThrough(store)).toEqual({
      name: 'Store X',
      address: 'Calle 9',
      description: 'D',
      approved: true,
      isActive: true,
    });
  });
});
