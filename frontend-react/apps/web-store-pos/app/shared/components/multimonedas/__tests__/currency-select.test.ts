import { describe, expect, it } from 'vitest';
import { hasMultiMonedasAvailable } from '~/shared/components/multimonedas/currency-select';
import type { UserModel } from '@store-mgmt/domain';
import { EModules } from '@store-mgmt/domain';

function userWith(storeModuleIds: number[]): UserModel {
  return {
    id: 'u1',
    userName: 'owner',
    email: 'o@x.com',
    tenantId: 't1',
    selectedStoreId: 's1',
    roles: [],
    featureIds: [],
    storeModuleIds,
    storeList: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
  } as unknown as UserModel;
}

describe('hasMultiMonedasAvailable (module 15 gate)', () => {
  it('true when the store has the MultiMonedas module', () => {
    expect(hasMultiMonedasAvailable(userWith([2, 3, EModules.MultiMonedas]))).toBe(true);
  });

  it('false without the module', () => {
    expect(hasMultiMonedasAvailable(userWith([2, 3]))).toBe(false);
  });

  it('false for null user', () => {
    expect(hasMultiMonedasAvailable(null)).toBe(false);
  });
});
