import { describe, expect, it } from 'vitest';
import type { UserModel } from '@store-mgmt/domain';
import { isCatalogStoreStaff } from '~/catalog/lib/catalog-staff';

const STORE_ID = 's-mi-tienda';
const OTHER_STORE_ID = 's-otra-tienda';

/**
 * Usuario de `/me` con lo MÍNIMO que mira la regla: `roles` es el mapa tienda→módulos que el
 * backend devuelve, así que un `StoreUser` solo es reconocible por ahí. Se sobrescribe campo a
 * campo para que cada caso aclare QUÉ lo hace elegible y no lo herede de otro.
 */
function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    login: 'ana@tienda.cu',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 3_600_000,
    id: 'u1',
    fullName: 'Ana Pérez',
    cellPhone: '5351234567',
    email: 'ana@tienda.cu',
    isActive: true,
    password: '',
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: '',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'AlDia',
    ...overrides,
  };
}

/** Rol de `StoreUser` en la tienda del slug: `{ storeId, … }` es lo que lo ata a ESA tienda. */
function roleAt(storeId: string) {
  return { storeId, storeName: 'Tienda', moduleId: 1, featureIds: [1] };
}

describe('isCatalogStoreStaff', () => {
  describe('sin sesión', () => {
    // La vista pública la abre cualquiera. Sin usuario no hay staff, y el flujo de WhatsApp se
    // queda EXACTAMENTE como estaba.
    it.each([
      ['null', null],
      ['undefined', undefined],
    ] as const)('con usuario %s no hay staff', (_label, user) => {
      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });
  });

  describe('supervisores', () => {
    // SuperAdmin y ReSeller administran tiendas que no son suyas: si entraran en modo staff
    // dejarían de ver el flujo del cliente, que es el que corresponde a un catálogo ajeno.
    it('un SuperAdmin nunca es staff de la tienda del catálogo', () => {
      const user = makeUser({ isSuperAdmin: true, selectedStoreId: STORE_ID, isOwnerAdmin: true });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });

    it('un ReSeller nunca es staff de la tienda del catálogo', () => {
      const user = makeUser({ isReSeller: true, selectedStoreId: STORE_ID, isOwnerAdmin: true });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });
  });

  describe('pertenencia a la tienda', () => {
    // Owner de OTRA tienda: coincide en el tipo de rol, no en la tienda. Sin el `storeId` el modo
    // staff le quitaría a un tercero el aviso de WhatsApp de una tienda ajena.
    it('un owner de OTRA tienda no es staff', () => {
      const user = makeUser({
        isOwnerAdmin: true,
        selectedStoreId: OTHER_STORE_ID,
        storeList: [{ id: OTHER_STORE_ID, name: 'Otra tienda' }],
      });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });

    // Un usuario que no aparece en ninguna tienda no puede registrar pedidos como si fuera de
    // esta: su pertenencia es la condición, no un detalle de la UI.
    it('un usuario sin pertenencia a ninguna tienda no es staff', () => {
      const user = makeUser({ selectedStoreId: '', storeList: undefined, roles: [] });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });
  });

  describe('owner de la tienda', () => {
    // El OwnerAdmin no tiene fila `StoreUser` en la base: su vínculo llega por `selectedStoreId`
    // y por `storeList`. Los DOS caminos cuentan, según de dónde venga la sesión.
    it('es staff por selectedStoreId', () => {
      const user = makeUser({ isOwnerAdmin: true, selectedStoreId: STORE_ID });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(true);
    });

    it('es staff por storeList aunque selectedStoreId apunte a otra', () => {
      const user = makeUser({
        isOwnerAdmin: true,
        selectedStoreId: OTHER_STORE_ID,
        storeList: [{ id: OTHER_STORE_ID, name: 'Otra' }, { id: STORE_ID, name: 'Mi tienda' }],
      });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(true);
    });
  });

  describe('StoreUser de la tienda', () => {
    // El `StoreUser` sí tiene fila por tienda, y el mapa `roles` es lo que lo ata a ella: sin
    // ese `storeId` la pertenencia no se puede probar.
    it('es staff por su rol en esa tienda', () => {
      const user = makeUser({ roles: [roleAt(OTHER_STORE_ID), roleAt(STORE_ID)] });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(true);
    });

    // Con `selectedStoreId` coincidente pero SIN rol en la tienda, la pertenencia es real pero
    // el rol no: se queda en el flujo normal en vez de degradarse a un half-auth.
    it('con la tienda seleccionada pero sin rol en ella, no es staff', () => {
      const user = makeUser({ selectedStoreId: STORE_ID, roles: [roleAt(OTHER_STORE_ID)] });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });
  });

  describe('entradas incompletas', () => {
    // La regla lee datos que vienen de una sesión cacheada y de un backend que evoluciona: un
    // campo ausente o corrupto NO puede romper el catálogo. Sin prueba positiva de pertenencia, la
    // respuesta es el flujo normal — degradar a `false`, nunca devolver `true` por accidente.
    it.each([
      ['sin roles', { roles: undefined as unknown as UserModel['roles'] }],
      ['con roles no-array', { roles: 's1' as unknown as UserModel['roles'] }],
      ['con roles con entradas nulas', { roles: [null] as unknown as UserModel['roles'] }],
      ['sin storeList', { storeList: undefined }],
      ['con storeList no-array', { storeList: {} as unknown as UserModel['storeList'] }],
    ] as const)('con %s, y sin otra prueba, devuelve false sin romperse', (_label, overrides) => {
      const user = makeUser(overrides);

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(false);
    });

    // Y al revés: un campo corrupto que NO participa en la prueba positiva no puede tumbar una
    // elegibilidad ya demostrada por `selectedStoreId` + `isOwnerAdmin`.
    it('un roles corrupto no tira abajo a un owner ya identificado por selectedStoreId', () => {
      const user = makeUser({
        isOwnerAdmin: true,
        selectedStoreId: STORE_ID,
        roles: 's1' as unknown as UserModel['roles'],
        storeList: {} as unknown as UserModel['storeList'],
      });

      expect(isCatalogStoreStaff(user, STORE_ID)).toBe(true);
    });

    // Sin catálogo cargado todavía no hay `storeId` contra el que comparar: flujo normal.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['vacío', ''],
    ] as const)('con storeId %s no hay staff', (_label, storeId) => {
      const user = makeUser({ isOwnerAdmin: true, selectedStoreId: STORE_ID });

      expect(isCatalogStoreStaff(user, storeId)).toBe(false);
    });
  });
});