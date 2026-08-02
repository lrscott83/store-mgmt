import { beforeEach, describe, expect, it } from 'vitest';
import { OrderType, PaymentType } from '@store-mgmt/domain';
import type { Product } from '@store-mgmt/domain';
import type { CartItem } from '~/shared/lib/stores/cart-store';
import { OrderOfflineService } from '../order-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-orders-${storeId}`;

function v2Bundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 999_999_999_999,
    formatVersion: 2,
    storeId,
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana',
        isActive: true,
        roles: [],
        featureIds: [],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: storeId,
        verifier: { hash: 'h', salt: 's', iterations: 210_000 },
        wrappedDek: 'ct',
        wrapSalt: 'salt',
        wrapIv: 'iv',
      },
    ],
  };
}

function makeProduct(): Product {
  return {
    id: 'p1',
    name: 'Widget',
    categoryId: 'cat-1',
    categoryName: 'Cat 1',
    price: 10,
    order: 0,
    availableToSale: true,
    // false — keeps the inventory-deduction cascade out of scope for this seam test.
    discountFromInvantory: false,
    businessId: 'biz',
    isActive: true,
    createdDate: new Date('2024-01-01T00:00:00.000Z'),
    createdByName: 'test',
  };
}

function makeCartItems(): CartItem[] {
  return [{ product: makeProduct(), quantity: 2 }];
}

describe('order-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', async () => {
    const service = new OrderOfflineService(storeId);
    await service.createOrder(makeCartItems(), OrderType.Normal, false, PaymentType.Efectivo, undefined, '');

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(service.getStorageOrders()).toHaveLength(1);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', async () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new OrderOfflineService(storeId);
    await service.createOrder(makeCartItems(), OrderType.Normal, false, PaymentType.Efectivo, undefined, '');

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    expect(service.getStorageOrders()).toHaveLength(1);
    expect(service.getStorageOrders()[0].total).toBe(20);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', async () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new OrderOfflineService(storeId);
    await service.createOrder(makeCartItems(), OrderType.Normal, false, PaymentType.Efectivo, undefined, '');

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const lockedService = new OrderOfflineService(storeId);
    expect(() => lockedService.getStorageOrders()).toThrow(MissingDataKeyError);

    const rawAfter = localStorage.getItem(storageKey);
    expect(rawAfter).toBe(rawBefore);
  });
});
