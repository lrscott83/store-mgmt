import { beforeEach, describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { ExpenseOfflineService } from '../expense-offline-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-expenses-${storeId}`;

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

describe('expense-offline-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const service = new ExpenseOfflineService(storeId);
    service.create({ type: ExpenseType.Otro, total: 50, date: new Date(), paymentType: PaymentType.Efectivo });

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();
    expect(service.getStorageExpenses()).toHaveLength(1);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new ExpenseOfflineService(storeId);
    service.create({ type: ExpenseType.Otro, total: 50, date: new Date(), paymentType: PaymentType.Efectivo });

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    expect(service.getStorageExpenses()).toHaveLength(1);
    expect(service.getStorageExpenses()[0].total).toBe(50);
  });

  it('a provisioned-but-locked read never destroys existing ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new ExpenseOfflineService(storeId);
    service.create({ type: ExpenseType.Otro, total: 50, date: new Date(), paymentType: PaymentType.Efectivo });

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const lockedService = new ExpenseOfflineService(storeId);
    expect(() => lockedService.getStorageExpenses()).toThrow(MissingDataKeyError);

    const rawAfter = localStorage.getItem(storageKey);
    expect(rawAfter).toBe(rawBefore);
  });
});
