import { beforeEach, describe, expect, it } from 'vitest';
import { SaleCreditOfflineService } from '../sale-credit-offline-service';
import { PaymentType } from '@store-mgmt/domain';
import type { UserModel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'jdoe',
    fullName: 'Test User',
    cellPhone: '',
    email: 'jdoe@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: 's1',
    ...overrides,
  };
}

describe('SaleCreditOfflineService', () => {
  let service: SaleCreditOfflineService;
  const storeId = 's1';

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: makeUser({ login: 'jdoe' }), isAuthenticated: true, isLoading: false, error: null });
    service = new SaleCreditOfflineService(storeId);
  });

  describe('SC-01: createFromOrder sets paid=0 and isPaid=false', () => {
    it('creates a credit with paid=0', () => {
      const credit = service.createFromOrder('order-1', 'Juan Perez', 150);
      expect(credit.paid).toBe(0);
    });

    it('creates a credit with isPaid=false', () => {
      const credit = service.createFromOrder('order-1', 'Juan Perez', 150);
      expect(credit.isPaid).toBe(false);
    });

    it('creates a credit with the correct total', () => {
      const credit = service.createFromOrder('order-1', 'Maria Lopez', 75);
      expect(credit.total).toBe(75);
    });

    it('creates a credit with isActive=true', () => {
      const credit = service.createFromOrder('order-1', 'Carlos', 50);
      expect(credit.isActive).toBe(true);
    });

    it('creates a credit with the correct orderId', () => {
      const credit = service.createFromOrder('order-abc', 'Ana', 100);
      expect(credit.orderId).toBe('order-abc');
    });

    it('creates a credit with the correct client name', () => {
      const credit = service.createFromOrder('order-1', 'Pedro Garcia', 200);
      expect(credit.client).toBe('Pedro Garcia');
    });

    it('persists the credit to localStorage', () => {
      service.createFromOrder('order-1', 'Juan', 100);
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      expect(raw).not.toBeNull();
    });

    it('creates a credit with a unique id', () => {
      const c1 = service.createFromOrder('order-1', 'Ana', 50);
      const c2 = service.createFromOrder('order-2', 'Bob', 75);
      expect(c1.id).not.toBe(c2.id);
    });

    // Angular parity (audit-user-threading): createFromOrder follows CREATE semantics
    // (matches Angular createSaleCredit) — createdByName from login, updatedByName/
    // updatedDate untouched.
    it('stamps createdByName with the authenticated user login', () => {
      const credit = service.createFromOrder('order-1', 'Juan Perez', 150);
      expect(credit.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on createFromOrder', () => {
      const credit = service.createFromOrder('order-1', 'Juan Perez', 150);
      expect(credit.updatedByName).toBeUndefined();
      expect(credit.updatedDate).toBeUndefined();
    });
  });

  describe('SC-02: pay sets paid=total regardless of context (full payment only — C-7)', () => {
    it('sets paid equal to total', () => {
      const credit = service.createFromOrder('order-1', 'Juan', 150);
      const paid = service.pay(credit.id, PaymentType.Efectivo, '');
      expect(paid.paid).toBe(150);
    });

    it('sets isPaid=true', () => {
      const credit = service.createFromOrder('order-1', 'Ana', 80);
      const paid = service.pay(credit.id, PaymentType.Tarjeta, '');
      expect(paid.isPaid).toBe(true);
    });

    it('sets paidType to the provided payment type', () => {
      const credit = service.createFromOrder('order-1', 'Carlos', 200);
      const paid = service.pay(credit.id, PaymentType.Zelle, 'via zelle');
      expect(paid.paidType).toBe(PaymentType.Zelle);
    });

    it('sets paidDate to a Date', () => {
      const credit = service.createFromOrder('order-1', 'Laura', 120);
      const paid = service.pay(credit.id, PaymentType.Efectivo, '');
      expect(paid.paidDate).toBeInstanceOf(Date);
    });

    it('persists the updated credit', () => {
      const credit = service.createFromOrder('order-1', 'Luis', 300);
      service.pay(credit.id, PaymentType.Efectivo, '');
      const retrieved = service.getById(credit.id);
      expect(retrieved?.isPaid).toBe(true);
      expect(retrieved?.paid).toBe(300);
    });

    // Angular parity (audit-user-threading): pay stamps updatedByName from login.
    it('stamps updatedByName with the authenticated user login', () => {
      const credit = service.createFromOrder('order-1', 'Luis', 300);
      const paid = service.pay(credit.id, PaymentType.Efectivo, '');
      expect(paid.updatedByName).toBe('jdoe');
    });
  });

  describe('SC-03: voidByOrderId sets isActive=false', () => {
    it('sets isActive=false on the credit linked to the given orderId', () => {
      service.createFromOrder('order-x', 'Maria', 100);
      service.voidByOrderId('order-x');
      const all = service.getAll();
      const credit = all.find((c) => c.orderId === 'order-x');
      expect(credit?.isActive).toBe(false);
    });

    it('only voids credits for the matching orderId', () => {
      service.createFromOrder('order-1', 'Ana', 50);
      service.createFromOrder('order-2', 'Bob', 75);
      service.voidByOrderId('order-1');
      const all = service.getAll();
      const creditForOrder2 = all.find((c) => c.orderId === 'order-2');
      expect(creditForOrder2?.isActive).toBe(true);
    });

    it('does nothing when no credit matches the orderId', () => {
      service.createFromOrder('order-1', 'Ana', 50);
      expect(() => service.voidByOrderId('order-999')).not.toThrow();
    });

    // Angular parity (audit-user-threading): voidByOrderId stamps updatedByName from login.
    it('stamps updatedByName with the authenticated user login', () => {
      service.createFromOrder('order-x', 'Maria', 100);
      service.voidByOrderId('order-x');
      const all = service.getAll();
      const credit = all.find((c) => c.orderId === 'order-x');
      expect(credit?.updatedByName).toBe('jdoe');
    });
  });

  describe('SC-11: update stamps updatedByName', () => {
    it('stamps updatedByName with the authenticated user login', () => {
      const credit = service.createFromOrder('order-1', 'Juan', 150);
      const updated = service.update(credit.id, 'Juan Perez', 'note');
      expect(updated.updatedByName).toBe('jdoe');
    });
  });

  describe('SC-12: void stamps updatedByName', () => {
    it('sets isActive=false and stamps updatedByName with the authenticated user login', () => {
      const credit = service.createFromOrder('order-1', 'Ana', 50);
      service.void(credit.id);
      const found = service.getById(credit.id);
      expect(found?.isActive).toBe(false);
      expect(found?.updatedByName).toBe('jdoe');
    });
  });

  describe('SC-04: getAll', () => {
    it('returns empty array initially', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('returns all created credits', () => {
      service.createFromOrder('o1', 'A', 10);
      service.createFromOrder('o2', 'B', 20);
      expect(service.getAll()).toHaveLength(2);
    });
  });

  describe('SC-05: getById', () => {
    it('returns undefined for unknown id', () => {
      expect(service.getById('nonexistent')).toBeUndefined();
    });

    it('returns the correct credit', () => {
      const c = service.createFromOrder('o1', 'Ana', 100);
      const found = service.getById(c.id);
      expect(found?.id).toBe(c.id);
    });
  });

  describe('SC-06: getByDateRange', () => {
    it('returns credits within the date range', () => {
      service.createFromOrder('o1', 'Ana', 100);
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      const results = service.getByDateRange(from, to);
      expect(results).toHaveLength(1);
    });

    it('excludes credits outside the date range', () => {
      service.createFromOrder('o1', 'Ana', 100);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterday);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const results = service.getByDateRange(yesterday, yesterdayEnd);
      expect(results).toHaveLength(0);
    });
  });

  describe('SC-07: getActiveToday', () => {
    it('returns active credits created today', () => {
      service.createFromOrder('o1', 'Ana', 100);
      expect(service.getActiveToday()).toHaveLength(1);
    });

    it('excludes voided credits', () => {
      service.createFromOrder('o1', 'Ana', 100);
      service.voidByOrderId('o1');
      expect(service.getActiveToday()).toHaveLength(0);
    });
  });

  describe('SC-08: storage key format', () => {
    it('uses lizoft.store-saleCredits-{storeId} as key', () => {
      service.createFromOrder('o1', 'Ana', 100);
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('SC-09: getUnpaidCreatedToday (Angular getUnPaidSaleCreditsInDayObservable 1:1 port)', () => {
    it('returns active unpaid credits created today', () => {
      service.createFromOrder('o1', 'Ana', 100);
      expect(service.getUnpaidCreatedToday()).toHaveLength(1);
    });

    it('excludes credits that were already paid', () => {
      const credit = service.createFromOrder('o1', 'Ana', 100);
      service.pay(credit.id, PaymentType.Efectivo, '');
      expect(service.getUnpaidCreatedToday()).toHaveLength(0);
    });

    it('excludes credits not created today', () => {
      const credit = service.createFromOrder('o1', 'Ana', 100);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      const entries: [string, Record<string, unknown>][] = JSON.parse(raw ?? '[]');
      const backdated = entries.map(([key, value]) => [
        key,
        { ...value, date: yesterday.toISOString() },
      ]);
      localStorage.setItem('lizoft.store-saleCredits-s1', JSON.stringify(backdated));

      expect(service.getUnpaidCreatedToday()).toHaveLength(0);
    });
  });

  describe('SC-10: getPaidToday (Angular getPaidSaleCreditsInDayObservable 1:1 port)', () => {
    it('returns active credits paid today', () => {
      const credit = service.createFromOrder('o1', 'Ana', 100);
      service.pay(credit.id, PaymentType.Efectivo, '');
      expect(service.getPaidToday()).toHaveLength(1);
    });

    it('excludes unpaid credits', () => {
      service.createFromOrder('o1', 'Ana', 100);
      expect(service.getPaidToday()).toHaveLength(0);
    });

    it('excludes voided (inactive) credits even if paid', () => {
      const credit = service.createFromOrder('o1', 'Ana', 100);
      service.pay(credit.id, PaymentType.Efectivo, '');
      service.void(credit.id);
      expect(service.getPaidToday()).toHaveLength(0);
    });
  });

  // WU1 (offline-online-service-parity, Slice 1): delete(id) is a BaseService<SaleCredit>
  // conformance alias for void(id) — void already IS the plain soft-delete equivalent
  // (isActive=false, no cascade), so this is a zero-behavior-change rename exposure.
  describe('SC-11: delete is a BaseService<SaleCredit> alias for void', () => {
    it('sets isActive=false, same as void', () => {
      const credit = service.createFromOrder('order-1', 'Ana', 100);
      service.delete(credit.id);
      expect(service.getById(credit.id)?.isActive).toBe(false);
    });

    it('is a no-op for a missing id, same as void', () => {
      expect(() => service.delete('missing-id')).not.toThrow();
    });
  });
});
