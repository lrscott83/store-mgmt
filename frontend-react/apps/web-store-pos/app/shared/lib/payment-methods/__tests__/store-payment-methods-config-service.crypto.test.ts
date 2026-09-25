import { beforeEach, describe, expect, it } from 'vitest';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import {
  ALL_CHANNEL_KEYS,
  DEFAULT_ENABLED_CHANNEL_KEYS,
  StorePaymentMethodsConfigService,
} from '../store-payment-methods-config-service';
import { setDek, clearDek } from '~/shared/lib/storage/data-key-store';
import { importRoster, clearRoster } from '~/shared/lib/offline/roster-store';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';
import type { OfflineRosterBundle } from '~/shared/lib/offline/roster-types';

const storeId = 's1';
const storageKey = `lizoft.store-storePaymentMethods-${storeId}`;
const zelleUsdKey = '1|1';

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

describe('store-payment-methods-config-service — at-rest encryption seam (entity-at-rest-encryption)', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDek();
    clearRoster();
  });

  it('plaintext mode: unprovisioned device writes/reads raw plain JSON, byte-identical to before', () => {
    const service = new StorePaymentMethodsConfigService(storeId);
    service.setChannelEnabled(storeId, SalePaymentMethod.Zelle, Currency.USD, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(false);
    expect(() => JSON.parse(raw!)).not.toThrow();

    expect(service.getEnabledChannels()).not.toContain(zelleUsdKey);
    expect(service.getEnabledMethods()).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
  });

  it('provisioned + unlocked write produces enc:v1: ciphertext, service read round-trips', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new StorePaymentMethodsConfigService(storeId);
    service.setChannelEnabled(storeId, SalePaymentMethod.Zelle, Currency.USD, false);

    const raw = localStorage.getItem(storageKey);
    expect(raw).not.toBeNull();
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const fresh = new StorePaymentMethodsConfigService(storeId);
    const channels = fresh.getEnabledChannels();
    expect(channels).not.toContain(zelleUsdKey);
    expect(channels).toHaveLength(ALL_CHANNEL_KEYS.length - 1);
    // Efectivo can never be disabled: it survives the round-trip regardless.
    expect(fresh.isChannelEnabled(SalePaymentMethod.Efectivo, Currency.CUP)).toBe(true);
    expect(fresh.isChannelEnabled(SalePaymentMethod.Zelle, Currency.USD)).toBe(false);
    expect(fresh.getEnabledMethodsForCurrency(Currency.USD)).toEqual([
      SalePaymentMethod.Efectivo,
      SalePaymentMethod.Transferencia,
    ]);
    expect(fresh.getStorageStorePaymentMethods()?.enabledChannels).toEqual(channels);
  });

  it('the backup write seam stores an imported config as ciphertext, byte-identical after reload', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);

    const service = new StorePaymentMethodsConfigService(storeId);
    const enabledChannels = ALL_CHANNEL_KEYS.filter((key) => key === zelleUsdKey);
    service.setConfigFromBackup({ enabledChannels }, storeId);

    const raw = localStorage.getItem(storageKey);
    expect(raw!.startsWith('enc:v1:')).toBe(true);

    const fresh = new StorePaymentMethodsConfigService(storeId);
    expect(fresh.getConfig().enabledChannels).toEqual(enabledChannels);
    expect(fresh.getEnabledChannels()).toEqual(enabledChannels);
  });

  it('a provisioned-but-locked render-path read degrades to the default and never touches the ciphertext', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    new StorePaymentMethodsConfigService(storeId).setChannelEnabled(
      storeId,
      SalePaymentMethod.Zelle,
      Currency.USD,
      false,
    );

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned
    const locked = new StorePaymentMethodsConfigService(storeId);
    // getConfig runs during render: it catches MissingDataKeyError and falls back
    // to the default WITHOUT persisting (encryptEntity needs the same missing key).
    expect(locked.getEnabledChannels()).toEqual([...DEFAULT_ENABLED_CHANNEL_KEYS]);
    // The backup read seam has no such guard: it surfaces the recoverable error.
    expect(() => locked.getStorageStorePaymentMethods()).toThrow(MissingDataKeyError);

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });

  it('a provisioned-but-locked write throws on the encrypt seam, ciphertext unchanged (by design)', () => {
    importRoster(v2Bundle(), 500);
    setDek(new Uint8Array(32).fill(0x07), storeId);
    const service = new StorePaymentMethodsConfigService(storeId);
    service.setChannelEnabled(storeId, SalePaymentMethod.Zelle, Currency.USD, false);

    const rawBefore = localStorage.getItem(storageKey);
    expect(rawBefore!.startsWith('enc:v1:')).toBe(true);

    clearDek(); // lock — roster still provisioned; writing plaintext over ciphertext is impossible
    expect(() =>
      service.setChannelEnabled(storeId, SalePaymentMethod.Transferencia, Currency.CUP, false),
    ).toThrow(MissingDataKeyError);
    expect(() => service.setConfigFromBackup({ enabledChannels: [] }, storeId)).toThrow(
      MissingDataKeyError,
    );

    expect(localStorage.getItem(storageKey)).toBe(rawBefore);
  });
});
