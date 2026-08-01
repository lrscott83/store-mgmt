import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleCreditOfflineService } from '../sale-credit-offline-service';
import { PaymentType } from '@store-mgmt/domain';
import type { BaseResponseModel, SaleCredit, UserModel } from '@store-mgmt/domain';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

// response-envelope-nullability: `data` only narrows to non-null on the succeeded
// branch. These tests only ever exercise the success path, so unwrap once instead of
// repeating an `if (!x.succeeded) throw` guard at every assertion site.
function unwrap<T>(response: BaseResponseModel<T>): T {
  if (!response.succeeded) throw new Error('expected succeeded response');
  return response.data;
}

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
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
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

  // Convenience: unwraps createSaleCredit's DataResult<SaleCredit> to the created SaleCredit
  // for the many tests below that only need a seeded credit (mirrors Expense-slice precedent).
  function createCredit(orderId: string, client: string, total: number, note = ''): SaleCredit {
    return service.createSaleCredit(orderId, client, total, note).data!;
  }

  // WU4 (baseservice-parity): getById() was removed (zero prod call-sites, rule 12) — tests
  // that only needed a by-id lookup (not testing getById itself) use this helper instead.
  function findCredit(id: string): SaleCredit | undefined {
    return service.getStorageSaleCredits().find((c) => c.id === id);
  }

  describe('SC-01: createSaleCredit returns a succeeded DataResult (paid=0, isPaid=false)', () => {
    it('returns a succeeded DataResult with paid=0', () => {
      const result = service.createSaleCredit('order-1', 'Juan Perez', 150, '');
      expect(result.succeeded).toBe(true);
      expect(result.data!.paid).toBe(0);
    });

    it('creates a credit with isPaid=false', () => {
      const result = service.createSaleCredit('order-1', 'Juan Perez', 150, '');
      expect(result.data!.isPaid).toBe(false);
    });

    it('creates a credit with the correct total', () => {
      const result = service.createSaleCredit('order-1', 'Maria Lopez', 75, '');
      expect(result.data!.total).toBe(75);
    });

    it('creates a credit with isActive=true', () => {
      const result = service.createSaleCredit('order-1', 'Carlos', 50, '');
      expect(result.data!.isActive).toBe(true);
    });

    it('creates a credit with the correct orderId', () => {
      const result = service.createSaleCredit('order-abc', 'Ana', 100, '');
      expect(result.data!.orderId).toBe('order-abc');
    });

    it('creates a credit with the correct client name', () => {
      const result = service.createSaleCredit('order-1', 'Pedro Garcia', 200, '');
      expect(result.data!.client).toBe('Pedro Garcia');
    });

    it('creates a credit with the correct note', () => {
      const result = service.createSaleCredit('order-1', 'Pedro Garcia', 200, 'a note');
      expect(result.data!.note).toBe('a note');
    });

    it('persists the credit to localStorage', () => {
      service.createSaleCredit('order-1', 'Juan', 100, '');
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      expect(raw).not.toBeNull();
    });

    it('creates a credit with a unique id', () => {
      const c1 = createCredit('order-1', 'Ana', 50);
      const c2 = createCredit('order-2', 'Bob', 75);
      expect(c1.id).not.toBe(c2.id);
    });

    // createSaleCredit's DataResult MUST NOT be a BaseResponseModel (no message/actionCode
    // fields) — design ADR-3 envelope-distinctness conformance.
    it('returns a DataResult, not a BaseResponseModel (no message/actionCode)', () => {
      const result = service.createSaleCredit('order-1', 'Ana', 50, '');
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('actionCode');
    });

    // Angular parity (audit-user-threading): createSaleCredit follows CREATE semantics —
    // createdByName from login, updatedByName/updatedDate untouched.
    it('stamps createdByName with the authenticated user login', () => {
      const credit = createCredit('order-1', 'Juan Perez', 150);
      expect(credit.createdByName).toBe('jdoe');
    });

    it('leaves updatedByName/updatedDate undefined on createSaleCredit', () => {
      const credit = createCredit('order-1', 'Juan Perez', 150);
      expect(credit.updatedByName).toBeUndefined();
      expect(credit.updatedDate).toBeUndefined();
    });
  });

  describe('SC-02: paidSaleCredit sets paid=total regardless of context (full payment only — C-7)', () => {
    it('returns a succeeded DataResult with paid equal to total', () => {
      const credit = createCredit('order-1', 'Juan', 150);
      const result = service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      expect(result.succeeded).toBe(true);
      expect(result.data!.paid).toBe(150);
    });

    it('sets isPaid=true', () => {
      const credit = createCredit('order-1', 'Ana', 80);
      const result = service.paidSaleCredit(credit.id, PaymentType.Tarjeta, '');
      expect(result.data!.isPaid).toBe(true);
    });

    it('sets paidType to the provided payment type', () => {
      const credit = createCredit('order-1', 'Carlos', 200);
      const result = service.paidSaleCredit(credit.id, PaymentType.Zelle, 'via zelle');
      expect(result.data!.paidType).toBe(PaymentType.Zelle);
    });

    it('sets paidDate to a Date', () => {
      const credit = createCredit('order-1', 'Laura', 120);
      const result = service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      expect(result.data!.paidDate).toBeInstanceOf(Date);
    });

    it('persists the updated credit', () => {
      const credit = createCredit('order-1', 'Luis', 300);
      service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      const retrieved = findCredit(credit.id);
      expect(retrieved?.isPaid).toBe(true);
      expect(retrieved?.paid).toBe(300);
    });

    // Angular parity (audit-user-threading): paidSaleCredit stamps updatedByName from login.
    it('stamps updatedByName with the authenticated user login', () => {
      const credit = createCredit('order-1', 'Luis', 300);
      const result = service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      expect(result.data!.updatedByName).toBe('jdoe');
    });

    // NEVER throws — missing id returns a failed DataResult with SaleCreditErrors.NotExists
    // (removes the pre-existing `throw new Error`, matches Angular's updateSaleCredit
    // sibling pattern for paidSaleCredit).
    it('returns a failed DataResult (SaleCreditErrors.NotExists) for a missing id, without throwing', () => {
      const result = service.paidSaleCredit('missing-id', PaymentType.Efectivo, '');
      expect(result.succeeded).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toEqual([{ code: 'SaleCredit.NotExists', description: 'El gasto no existe.' }]);
    });
  });

  describe('SC-03: deactivateSaleCreditByOrderId — single-match, never a loop (flagged mismatch #6)', () => {
    it('sets isActive=false on the credit linked to the given orderId', () => {
      createCredit('order-x', 'Maria', 100);
      const result = service.deactivateSaleCreditByOrderId('order-x');
      expect(result.succeeded).toBe(true);
      const all = service.getStorageSaleCredits();
      const credit = all.find((c) => c.orderId === 'order-x');
      expect(credit?.isActive).toBe(false);
    });

    it('only deactivates the FIRST active credit for the matching orderId (not all matches)', () => {
      const first = createCredit('order-1', 'Ana', 50);
      // Simulate a second (already-inactive) credit sharing the same orderId — the real
      // Angular scenario is edge-case, but the FIRST-match semantics must hold regardless.
      const second = createCredit('order-1', 'Ana Segundo', 60);
      service.deactivateSaleCreditByOrderId('order-1');
      const all = service.getStorageSaleCredits();
      const firstAfter = all.find((c) => c.id === first.id);
      const secondAfter = all.find((c) => c.id === second.id);
      // .find() returns the first ACTIVE match in storage insertion order — only ONE is
      // deactivated, the other keeps isActive=true (loop semantics would deactivate both).
      expect([firstAfter?.isActive, secondAfter?.isActive].filter((v) => v === false)).toHaveLength(1);
    });

    it('only deactivates credits for the matching orderId', () => {
      createCredit('order-1', 'Ana', 50);
      createCredit('order-2', 'Bob', 75);
      service.deactivateSaleCreditByOrderId('order-1');
      const all = service.getStorageSaleCredits();
      const creditForOrder2 = all.find((c) => c.orderId === 'order-2');
      expect(creditForOrder2?.isActive).toBe(true);
    });

    // Always resolves Result.Success() — even a no-op (no matching credit found), matching
    // Angular's ternary fallback (sale-credit-offline.service.ts:115-118).
    it('resolves Result.Success() (no-op) when no credit matches the orderId', () => {
      createCredit('order-1', 'Ana', 50);
      const result = service.deactivateSaleCreditByOrderId('order-999');
      expect(result.succeeded).toBe(true);
    });

    // Angular parity (audit-user-threading): deactivateSaleCreditByOrderId stamps
    // updatedByName from login (via the reused deleteSaleCredit command).
    it('stamps updatedByName with the authenticated user login', () => {
      createCredit('order-x', 'Maria', 100);
      service.deactivateSaleCreditByOrderId('order-x');
      const all = service.getStorageSaleCredits();
      const credit = all.find((c) => c.orderId === 'order-x');
      expect(credit?.updatedByName).toBe('jdoe');
    });
  });

  describe('SC-11: updateSaleCredit stamps updatedByName', () => {
    it('returns a succeeded DataResult and stamps updatedByName with the authenticated user login', () => {
      const credit = createCredit('order-1', 'Juan', 150);
      const result = service.updateSaleCredit(credit.id, 'Juan Perez', 'note');
      expect(result.succeeded).toBe(true);
      expect(result.data!.updatedByName).toBe('jdoe');
    });

    it('updates client and note', () => {
      const credit = createCredit('order-1', 'Juan', 150);
      const result = service.updateSaleCredit(credit.id, 'Juan Perez', 'a note');
      expect(result.data!.client).toBe('Juan Perez');
      expect(result.data!.note).toBe('a note');
    });

    // NEVER throws — missing id returns a failed DataResult (removes the pre-existing
    // `throw new Error`).
    it('returns a failed DataResult (SaleCreditErrors.NotExists) for a missing id, without throwing', () => {
      const result = service.updateSaleCredit('missing-id', 'X', 'Y');
      expect(result.succeeded).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toEqual([{ code: 'SaleCredit.NotExists', description: 'El gasto no existe.' }]);
    });
  });

  describe('SC-12: deleteSaleCredit — real Angular domain command, never throws (flagged mismatch #7)', () => {
    it('sets isActive=false and stamps updatedByName with the authenticated user login', () => {
      const credit = createCredit('order-1', 'Ana', 50);
      const result = service.deleteSaleCredit(credit.id);
      expect(result.succeeded).toBe(true);
      const found = findCredit(credit.id);
      expect(found?.isActive).toBe(false);
      expect(found?.updatedByName).toBe('jdoe');
    });

    it('returns a failed Result (SaleCreditErrors.NotExists) for a missing id, without throwing', () => {
      const result = service.deleteSaleCredit('missing-id');
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([{ code: 'SaleCredit.NotExists', description: 'El gasto no existe.' }]);
    });

    // deleteSaleCredit's Result MUST NOT be a BaseResponseModel/DataResult (no data/message
    // fields) — design ADR-3 envelope-distinctness conformance.
    it('returns a Result, not a BaseResponseModel/DataResult (no data/message/actionCode)', () => {
      const result = service.deleteSaleCredit('missing-id');
      expect(result).not.toHaveProperty('data');
      expect(result).not.toHaveProperty('message');
      expect(result).not.toHaveProperty('actionCode');
    });
  });

  describe('addImportedSaleCredit — 1:1 port of Angular addImportedSaleCredit', () => {
    it('appends the credit and always returns Result.Success()', () => {
      const credit: SaleCredit = {
        id: 'imported-1',
        orderId: 'order-1',
        client: 'Ana',
        total: 100,
        date: new Date('2024-01-01T10:00:00.000'),
        paid: 0,
        isPaid: false,
        isActive: true,
        paidDate: null as unknown as Date,
        paidType: null as unknown as PaymentType,
        note: '',
        createdDate: new Date('2024-01-01T10:00:00.000'),
        createdByName: 'import',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      const result = service.addImportedSaleCredit(credit);
      expect(result.succeeded).toBe(true);
      expect(findCredit('imported-1')).toBeDefined();
    });

    it('normalizes the incoming date to a Date instance', () => {
      const credit: SaleCredit = {
        id: 'imported-2',
        orderId: 'order-1',
        client: 'Ana',
        total: 100,
        date: '2024-01-01T10:00:00.000Z' as unknown as Date,
        paid: 0,
        isPaid: false,
        isActive: true,
        paidDate: null as unknown as Date,
        paidType: null as unknown as PaymentType,
        note: '',
        createdDate: new Date(),
        createdByName: 'import',
        updatedDate: undefined,
        updatedByName: undefined,
      };
      service.addImportedSaleCredit(credit);
      expect(findCredit('imported-2')?.date).toBeInstanceOf(Date);
    });
  });

  describe('updateImportedSaleCredit — 1:1 port of Angular updateImportedSaleCredit', () => {
    it('merges isActive/client/note/updatedDate/updatedByName into the existing record', () => {
      const credit = createCredit('order-1', 'Ana', 50);
      const result = service.updateImportedSaleCredit({
        ...credit,
        isActive: false,
        client: 'Ana Updated',
        note: 'imported note',
        updatedDate: new Date('2024-05-01T00:00:00.000'),
        updatedByName: 'importer',
      });
      expect(result.succeeded).toBe(true);
      const found = findCredit(credit.id);
      expect(found?.isActive).toBe(false);
      expect(found?.client).toBe('Ana Updated');
      expect(found?.note).toBe('imported note');
      expect(found?.updatedByName).toBe('importer');
    });

    it('overwrites paid/isPaid/paidDate ONLY when the existing record is unpaid', () => {
      const credit = createCredit('order-1', 'Ana', 50); // unpaid (paid=0)
      const paidDate = new Date('2024-05-01T00:00:00.000');
      service.updateImportedSaleCredit({
        ...credit,
        paid: 50,
        isPaid: true,
        paidDate,
      });
      const found = findCredit(credit.id);
      expect(found?.paid).toBe(50);
      expect(found?.isPaid).toBe(true);
      expect(found?.paidDate).toEqual(paidDate);
    });

    it('does NOT overwrite paid/isPaid/paidDate when the existing record is already paid', () => {
      const credit = createCredit('order-1', 'Ana', 50);
      service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      const paidBefore = findCredit(credit.id)!;
      service.updateImportedSaleCredit({
        ...paidBefore,
        paid: 999,
        isPaid: false,
        paidDate: new Date('2024-05-01T00:00:00.000'),
      });
      const found = findCredit(credit.id);
      expect(found?.paid).toBe(paidBefore.paid);
      expect(found?.isPaid).toBe(paidBefore.isPaid);
      expect(found?.paidDate).toEqual(paidBefore.paidDate);
    });

    it('is a no-op (still Result.Success()) for a missing id', () => {
      const result = service.updateImportedSaleCredit({
        id: 'missing-id',
        orderId: 'order-1',
        client: 'Ghost',
        total: 1,
        date: new Date(),
        paid: 0,
        isPaid: false,
        isActive: true,
        paidDate: null as unknown as Date,
        paidType: null as unknown as PaymentType,
        note: '',
        createdDate: new Date(),
        createdByName: 'import',
        updatedDate: undefined,
        updatedByName: undefined,
      });
      expect(result.succeeded).toBe(true);
      expect(findCredit('missing-id')).toBeUndefined();
    });
  });

  describe('SC-06: getSaleCreditsInDay (category B, sync BaseResponseModel)', () => {
    it('returns a succeeded BaseResponseModel with credits within the given day', () => {
      createCredit('o1', 'Ana', 100);
      const response = service.getSaleCreditsInDay(new Date());
      expect(response.succeeded).toBe(true);
      expect(response.data).toHaveLength(1);
    });

    it('is a BaseResponseModel, not a Result/DataResult (has message/actionCode)', () => {
      const response = service.getSaleCreditsInDay(new Date());
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('actionCode');
    });

    it('excludes credits outside the given day', () => {
      const credit = createCredit('o1', 'Ana', 100);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setCreditDate(credit.id, yesterday);
      expect(service.getSaleCreditsInDay(new Date()).data).toHaveLength(0);
    });

    it('excludes voided (inactive) credits', () => {
      createCredit('o1', 'Ana', 100);
      service.deactivateSaleCreditByOrderId('o1');
      expect(service.getSaleCreditsInDay(new Date()).data).toHaveLength(0);
    });

    it('sorts results ASC by date', () => {
      const later = createCredit('o1', 'Later', 10);
      const earlier = createCredit('o2', 'Earlier', 20);
      setCreditDate(earlier.id, new Date(Date.now() - 60_000));
      const response = service.getSaleCreditsInDay(new Date());
      expect(unwrap(response).map((c) => c.id)).toEqual([earlier.id, later.id]);
    });
  });

  describe('SC-08: storage key format', () => {
    it('uses lizoft.store-saleCredits-{storeId} as key', () => {
      createCredit('o1', 'Ana', 100);
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      expect(raw).not.toBeNull();
    });
  });

  describe('SC-09: getSaleCreditsInDayObservable (category C, async envelope)', () => {
    it('resolves a succeeded BaseResponseModel wrapping getSaleCreditsInDay', async () => {
      createCredit('o1', 'Ana', 100);
      await expect(service.getSaleCreditsInDayObservable(new Date())).resolves.toMatchObject({
        succeeded: true,
        data: [expect.objectContaining({ client: 'Ana' })],
      });
    });
  });

  describe('SC-09b: getUnPaidSaleCreditsInDayObservable (Angular exact name, category C)', () => {
    it('resolves active unpaid credits created today', async () => {
      createCredit('o1', 'Ana', 100);
      const response = await service.getUnPaidSaleCreditsInDayObservable(new Date());
      expect(response.succeeded).toBe(true);
      expect(response.data).toHaveLength(1);
    });

    it('excludes credits that were already paid', async () => {
      const credit = createCredit('o1', 'Ana', 100);
      service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      const response = await service.getUnPaidSaleCreditsInDayObservable(new Date());
      expect(response.data).toHaveLength(0);
    });

    it('excludes credits not created on the given date', async () => {
      const credit = createCredit('o1', 'Ana', 100);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      setCreditDate(credit.id, yesterday);
      const response = await service.getUnPaidSaleCreditsInDayObservable(new Date());
      expect(response.data).toHaveLength(0);
    });
  });

  describe('SC-10: getPaidSaleCreditsInDayObservable (Angular exact name, category C)', () => {
    it('resolves active credits paid today', async () => {
      const credit = createCredit('o1', 'Ana', 100);
      service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      const response = await service.getPaidSaleCreditsInDayObservable(new Date());
      expect(response.succeeded).toBe(true);
      expect(response.data).toHaveLength(1);
    });

    it('excludes unpaid credits', async () => {
      createCredit('o1', 'Ana', 100);
      const response = await service.getPaidSaleCreditsInDayObservable(new Date());
      expect(response.data).toHaveLength(0);
    });

    it('excludes voided (inactive) credits even if paid', async () => {
      const credit = createCredit('o1', 'Ana', 100);
      service.paidSaleCredit(credit.id, PaymentType.Efectivo, '');
      service.deleteSaleCredit(credit.id);
      const response = await service.getPaidSaleCreditsInDayObservable(new Date());
      expect(response.data).toHaveLength(0);
    });
  });

  describe('getSaleCreditsObservable (category C, NEW method, dead in Angular too)', () => {
    it('resolves all active credits, no other filter/sort', async () => {
      createCredit('o1', 'Ana', 100);
      createCredit('o2', 'Bob', 50);
      const response = await service.getSaleCreditsObservable();
      expect(response.succeeded).toBe(true);
      expect(response.data).toHaveLength(2);
    });

    it('excludes voided credits', async () => {
      createCredit('o1', 'Ana', 100);
      service.deactivateSaleCreditByOrderId('o1');
      const response = await service.getSaleCreditsObservable();
      expect(response.data).toHaveLength(0);
    });
  });

  // Test-only helper: `createSaleCredit` always stamps `date: now`, so to exercise
  // financial-window methods we backdate the persisted record directly (same
  // localStorage-rewrite technique already used by SC-09's "excludes credits not
  // created today" test). WU4 (eliminate-base-repository): plain-array wire format
  // (Angular parity, sale-credit-offline.service.ts:276-279), NOT Map-entries.
  // Writing straight to localStorage bypasses the service's per-instance cache (Angular
  // parity — getStorageSaleCredits only reloads when empty/key-changed), so we rebuild
  // `service` afterward to force a fresh read; every subsequent `service.*` call in the
  // outer describe closes over this same `let service` binding.
  function setCreditDate(id: string, date: Date) {
    const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
    const credits: Record<string, unknown>[] = JSON.parse(raw ?? '[]');
    const patched = credits.map((c) => (c.id === id ? { ...c, date: date.toISOString() } : c));
    localStorage.setItem('lizoft.store-saleCredits-s1', JSON.stringify(patched));
    service = new SaleCreditOfflineService(storeId);
  }

  // WU4 (eliminate-base-repository): inlined persistence — plain-array wire-format, cache,
  // auto-init, 1:1 port of Angular's sale-credit-offline.service.ts:285-302. Revival fields
  // (date/paidDate/createdDate/updatedDate) are UNCHANGED from current React behavior
  // (Decision Gate — SaleCredit revival bugs in Angular are explicitly OUT OF SCOPE).
  describe('Persistence — plain-array wire-format, cache, auto-init (sale-credit-offline.service.ts:285-302)', () => {
    it('persists sale credits on-disk as a PLAIN array of objects, never [id, credit] Map-entries pairs', () => {
      service.createSaleCredit('order-1', 'Ana', 100, '');

      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      const parsed = JSON.parse(raw!);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(1);
      expect(Array.isArray(parsed[0])).toBe(false);
      expect(typeof parsed[0]).toBe('object');
      expect(parsed[0].id).toBeTruthy();
    });

    it('auto-writes an empty array on the first empty read, without throwing', () => {
      expect(() => service.getStorageSaleCredits()).not.toThrow();
      const raw = localStorage.getItem('lizoft.store-saleCredits-s1');
      expect(raw).toBe('[]');
    });

    it('reuses the in-memory cache across two reads without an intervening write (localStorage.getItem hit once)', () => {
      localStorage.setItem(
        'lizoft.store-saleCredits-s1',
        JSON.stringify([{ id: 'sc1', orderId: 'o1', client: 'Ana', total: 10, isActive: true }]),
      );
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');

      service.getStorageSaleCredits();
      service.getStorageSaleCredits();

      const callsForKey = getItemSpy.mock.calls.filter(([key]) => key === 'lizoft.store-saleCredits-s1');
      expect(callsForKey).toHaveLength(1);
    });

    it('STILL revives date/paidDate/createdDate/updatedDate to Date instances on a fresh instance re-read (unchanged React behavior — Decision Gate)', () => {
      const raw = JSON.stringify([
        {
          id: 'sc1',
          orderId: 'order-1',
          client: 'Ana',
          total: 100,
          date: '2024-01-01T00:00:00.000Z',
          paid: 0,
          isPaid: false,
          isActive: true,
          paidDate: '2024-01-02T00:00:00.000Z',
          paidType: PaymentType.Efectivo,
          note: '',
          createdDate: '2024-01-01T00:00:00.000Z',
          createdByName: 'test',
          updatedDate: '2024-01-03T00:00:00.000Z',
          updatedByName: 'test',
        },
      ]);
      localStorage.setItem('lizoft.store-saleCredits-s1', raw);

      const freshService = new SaleCreditOfflineService(storeId);
      const found = freshService.getStorageSaleCredits().find((c) => c.id === 'sc1');
      expect(found?.date).toBeInstanceOf(Date);
      expect(found?.paidDate).toBeInstanceOf(Date);
      expect(found?.createdDate).toBeInstanceOf(Date);
      expect(found?.updatedDate).toBeInstanceOf(Date);
    });
  });

  // WU4: getActiveSaleCreditsPriceBetweenDates/Today/Yesterday
  describe('getActiveSaleCreditsPriceBetweenDates/Today/Yesterday', () => {
    it('sums active credits within a raw date window, excluding voided and out-of-range', () => {
      const start = new Date('2024-02-01T00:00:00.000');
      const end = new Date('2024-02-05T00:00:00.000');
      const inRange1 = createCredit('o1', 'Ana', 30);
      setCreditDate(inRange1.id, new Date('2024-02-02T10:00:00.000'));
      const inRange2 = createCredit('o2', 'Bob', 20);
      setCreditDate(inRange2.id, new Date('2024-02-03T10:00:00.000'));
      const outOfRange = createCredit('o3', 'Carl', 999);
      setCreditDate(outOfRange.id, new Date('2024-01-15T10:00:00.000'));
      service.deactivateSaleCreditByOrderId('o1');
      expect(service.getActiveSaleCreditsPriceBetweenDates(start, end)).toBe(20);
    });

    it('getActiveSaleCreditsPriceToday sums only credits dated today', () => {
      const today = createCredit('o1', 'Ana', 40);
      const yesterday = createCredit('o2', 'Bob', 999);
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      setCreditDate(yesterday.id, yesterdayDate);
      void today;
      expect(service.getActiveSaleCreditsPriceToday()).toBe(40);
    });

    it('getActiveSaleCreditsPriceYesterday sums only credits dated yesterday', () => {
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      yesterdayDate.setHours(10, 0, 0, 0);
      const yesterday = createCredit('o1', 'Ana', 15);
      setCreditDate(yesterday.id, yesterdayDate);
      createCredit('o2', 'Bob', 999); // today
      expect(service.getActiveSaleCreditsPriceYesterday()).toBe(15);
    });
  });

  // WU4: getActiveUnpaidSaleCreditsPriceToday/Yesterday
  describe('getActiveUnpaidSaleCreditsPriceToday/Yesterday', () => {
    it('getActiveUnpaidSaleCreditsPriceToday excludes paid credits dated today', () => {
      const unpaid = createCredit('o1', 'Ana', 40);
      const paid = createCredit('o2', 'Bob', 999);
      service.paidSaleCredit(paid.id, PaymentType.Efectivo, '');
      void unpaid;
      expect(service.getActiveUnpaidSaleCreditsPriceToday()).toBe(40);
    });

    it('getActiveUnpaidSaleCreditsPriceYesterday excludes paid credits dated yesterday', () => {
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      yesterdayDate.setHours(10, 0, 0, 0);
      const unpaid = createCredit('o1', 'Ana', 25);
      setCreditDate(unpaid.id, yesterdayDate);
      const paid = createCredit('o2', 'Bob', 999);
      setCreditDate(paid.id, yesterdayDate);
      service.paidSaleCredit(paid.id, PaymentType.Efectivo, '');
      expect(service.getActiveUnpaidSaleCreditsPriceYesterday()).toBe(25);
    });
  });

  // WU4: getSaleCreditsTotalBefore/Total/Yesterday
  describe('getSaleCreditsTotalBefore/Total/Yesterday', () => {
    it('getSaleCreditsTotalBefore sums active credits strictly before threshold date', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      const c1 = createCredit('o1', 'Ana', 10);
      setCreditDate(c1.id, new Date('2024-02-01T10:00:00.000'));
      const c2 = createCredit('o2', 'Bob', 25);
      setCreditDate(c2.id, new Date('2024-02-15T10:00:00.000'));
      const c3 = createCredit('o3', 'Carl', 999);
      setCreditDate(c3.id, new Date('2024-03-15T10:00:00.000')); // after threshold
      expect(service.getSaleCreditsTotalBefore(threshold)).toBe(35);
    });

    it('getSaleCreditsTotalBefore excludes voided credits', () => {
      const threshold = new Date('2024-03-01T00:00:00.000');
      const voided = createCredit('o1', 'Ana', 10);
      setCreditDate(voided.id, new Date('2024-02-01T10:00:00.000'));
      service.deactivateSaleCreditByOrderId('o1');
      const c2 = createCredit('o2', 'Bob', 25);
      setCreditDate(c2.id, new Date('2024-02-15T10:00:00.000'));
      expect(service.getSaleCreditsTotalBefore(threshold)).toBe(25);
    });

    it('getSaleCreditsTotal sums all active credits up through end of today', () => {
      createCredit('o1', 'Ana', 50); // today
      const c2 = createCredit('o2', 'Bob', 20);
      setCreditDate(c2.id, new Date('2024-01-01T10:00:00.000'));
      expect(service.getSaleCreditsTotal()).toBe(70);
    });

    it('getSaleCreditsTotalYesterday sums only credits strictly before today start', () => {
      const c1 = createCredit('o1', 'Ana', 20);
      setCreditDate(c1.id, new Date('2024-01-01T10:00:00.000'));
      createCredit('o2', 'Bob', 999); // today, excluded
      expect(service.getSaleCreditsTotalYesterday()).toBe(20);
    });
  });

  // WU4: filterSaleCredits (category C, async envelope port of Angular's Observable)
  describe('filterSaleCredits', () => {
    it('isPaid=true constrains to paid credits only', async () => {
      const paid = createCredit('o1', 'Ana', 50);
      service.paidSaleCredit(paid.id, PaymentType.Efectivo, '');
      createCredit('o2', 'Bob', 30);
      const response = await service.filterSaleCredits(true, null, null, null);
      expect(response.succeeded).toBe(true);
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].isPaid).toBe(true);
    });

    it('isPaid=false behaves as no filter on paid status (Angular quirk: !isPaid || ...)', async () => {
      const paid = createCredit('o1', 'Ana', 50);
      service.paidSaleCredit(paid.id, PaymentType.Efectivo, '');
      createCredit('o2', 'Bob', 30);
      const response = await service.filterSaleCredits(false, null, null, null);
      expect(response.data).toHaveLength(2);
    });

    it('filters by client substring match', async () => {
      createCredit('o1', 'Juan Perez', 50);
      createCredit('o2', 'Maria Lopez', 30);
      const response = await service.filterSaleCredits(false, 'Perez', null, null);
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].client).toBe('Juan Perez');
    });

    it('filters by date range when start/end provided', async () => {
      const c1 = createCredit('o1', 'Ana', 10);
      setCreditDate(c1.id, new Date('2024-01-01T10:00:00.000'));
      const c2 = createCredit('o2', 'Bob', 20);
      setCreditDate(c2.id, new Date('2024-06-01T10:00:00.000'));
      const response = await service.filterSaleCredits(
        false,
        null,
        new Date('2024-05-01T00:00:00.000'),
        new Date('2024-07-01T00:00:00.000'),
      );
      const data = unwrap(response);
      expect(data).toHaveLength(1);
      expect(data[0].total).toBe(20);
    });

    it('excludes voided credits regardless of filters', async () => {
      createCredit('o1', 'Ana', 10);
      service.deactivateSaleCreditByOrderId('o1');
      await expect(service.filterSaleCredits(false, null, null, null)).resolves.toMatchObject({ data: [] });
    });

    it('all-null call returns every active credit (Angular parity: filterSaleCredits(null, null, null, null))', async () => {
      createCredit('o1', 'Ana', 10);
      const response = await service.filterSaleCredits(null, null, null, null);
      expect(response.data).toHaveLength(1);
    });
  });
});
