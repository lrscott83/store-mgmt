import type { OpeningHoursEntry, Store } from '@store-mgmt/domain';

/** Bloque público de ubicación tal como lo espera `PUT /v1/stores/{id}`. */
export interface StoreLocationPayload {
  publicPhone?: string;
  addressCity?: string;
  addressProvince?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: OpeningHoursEntry[];
}

/** Campos de la tienda que un save ajeno al formulario debe reenviar sin tocar. */
export interface StorePassThroughPayload {
  name: string;
  address: string;
  description: string;
  approved: boolean;
  isActive: boolean;
}

/**
 * Proyecta el bloque de ubicación GUARDADO de una tienda para un save que solo quiere
 * preservarlo. El endpoint aplica el bloque completo bajo `updateLocation`; reenviar los
 * valores cargados evita que un guardado ajeno los borre. `null` → `undefined` (el JSON
 * omite la clave y el backend la interpreta como "sin dato"). Una coordenada 0 es válida y
 * se conserva: el nullish check solo descarta null/undefined.
 */
export function toStoredLocationPayload(store: Store): StoreLocationPayload {
  return {
    publicPhone: store.publicPhone ?? undefined,
    addressCity: store.addressCity ?? undefined,
    addressProvince: store.addressProvince ?? undefined,
    latitude: store.latitude ?? undefined,
    longitude: store.longitude ?? undefined,
    openingHours: store.openingHours,
  };
}

/** Proyecta los datos de la tienda que el panel de ubicación no edita. */
export function toStorePassThrough(store: Store): StorePassThroughPayload {
  return {
    name: store.name,
    address: store.address,
    description: store.description,
    approved: store.approved,
    isActive: store.isActive,
  };
}
