import { describe, it, expect } from 'vitest';
import { serializeRoster, deserializeRoster, WrongPasswordError, CorruptFileError } from '../roster-serializer';
import type { OfflineRosterBundle } from '../roster-types';

function makeBundle(): OfflineRosterBundle {
  return {
    bundleId: 'b1',
    issuedAt: 1000,
    expiresAt: 2_000_000_000_000,
    formatVersion: 1,
    storeId: 's1',
    users: [
      {
        id: 'u1',
        login: 'ana',
        fullName: 'Ana Pérez',
        isActive: true,
        roles: [],
        featureIds: [1, 2],
        storeModuleIds: [],
        isSuperAdmin: false,
        isOwnerAdmin: false,
        isReSeller: false,
        selectedStoreId: 's1',
        verifier: { hash: 'abc', salt: 'def', iterations: 210_000 },
      },
    ],
  };
}

describe('roster-serializer — bundle container round-trips losslessly', () => {
  it('deserializes to the exact original bundle with the same master + storeId', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    const result = await deserializeRoster(payload, 'm', 's1');
    expect(result).toEqual(bundle);
  });

  it('raises WrongPasswordError when deserializing with an incorrect master', async () => {
    const bundle = makeBundle();
    const payload = await serializeRoster(bundle, 'm', 's1');
    await expect(deserializeRoster(payload, 'wrong', 's1')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('raises CorruptFileError for a structurally invalid file', async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(deserializeRoster(garbage, 'm', 's1')).rejects.toBeInstanceOf(CorruptFileError);
  });
});
