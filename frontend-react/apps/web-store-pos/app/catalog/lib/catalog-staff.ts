import type { UserModel } from '@store-mgmt/domain';

/**
 * Un `UserModel` viene de `/me` y de sesiones cacheadas en el dispositivo: los campos pueden
 * faltar según de dónde se hydrate la tienda. Estas funciones leen esos campos sin asumir que
 * existen, y NUNCA devuelven `true` por defecto: ante la duda, `false` = flujo del cliente.
 */
function asArray<T>(value: T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * ¿Es este usuario staff de la tienda del catálogo?
 *
 * Solo el staff de ESA tienda entra en el modo sin WhatsApp: el cliente está presente, así que el
 * pedido se registra y no hay a quién enviárselo. Anónimo, SuperAdmin/ReSeller y staff de otra
 * tienda siguen viendo el flujo con WhatsApp (decisión D2).
 *
 * SuperAdmin y ReSeller quedan fuera aunque su `selectedStoreId` apunte a la tienda: su relación
 * con ella es de supervisión, no de pertenencia, y su catálogo es el del cliente.
 *
 * Dos pruebas, y NO una sola, porque las dos cosas que se piden no son la misma:
 * 1. PERTENECE a la tienda — `selectedStoreId`, `storeList` o un rol suyo. El OwnerAdmin no tiene
 *    fila `StoreUser` en la base: su vínculo llega por `selectedStoreId`/`storeList`.
 * 2. TIENE ROL en la tienda — `isOwnerAdmin` o un `StoreUser` en ella (roles con ese `storeId`).
 */
export function isCatalogStoreStaff(
  user: UserModel | null | undefined,
  catalogStoreId: string | null | undefined,
): boolean {
  // Sin usuario no hay staff; sin catálogo cargado todavía no hay `storeId` contra el que
  // comparar, así que tampoco se puede afirmar nada.
  if (!user || !catalogStoreId) return false;
  if (user.isSuperAdmin || user.isReSeller) return false;

  const roles = asArray(user.roles);
  const roleInStore = roles.some((role) => role?.storeId === catalogStoreId);

  const belongsToStore =
    user.selectedStoreId === catalogStoreId ||
    asArray(user.storeList).some((store) => store?.id === catalogStoreId) ||
    roleInStore;
  if (!belongsToStore) return false;

  return user.isOwnerAdmin === true || roleInStore;
}