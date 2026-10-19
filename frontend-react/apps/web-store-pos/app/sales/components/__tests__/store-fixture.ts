import type { Store } from '@store-mgmt/domain';

/**
 * Tienda completa para los tests del catálogo web (panel de ubicación y vista): un único
 * fixture evita que las copias se desincronicen cuando `Store` gane campos nuevos.
 */
export function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    paymentStartDate: '2024-01-01',
    nextPaymentDate: null,
    ownerPhone: null,
    planType: 'Pago',
    planPrice: 10,
    planCurrentPrice: 10,
    modules: [],
    publicPhone: '+53 5555 1234',
    addressCity: 'La Habana',
    addressProvince: 'Playa',
    latitude: 23.13,
    longitude: -82.38,
    openingHours: [{ day: 'Monday', opens: '09:00', closes: '17:00' }],
    isActive: true,
    ...overrides,
  };
}
