import { beforeEach, describe, expect, it } from 'vitest';
import {
  ExpenseFundSource,
  ExpenseType,
  PaymentType,
} from '@store-mgmt/domain';
import type { Expense, UserModel } from '@store-mgmt/domain';
import { ExpenseOfflineService } from './expense-offline-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';

const storeId = 'store-fund-source';
const STORAGE_KEY = `lizoft.store-expenses-${storeId}`;

function makeUser(): UserModel {
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
  };
}

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    type: ExpenseType.Comida,
    total: 50,
    date: new Date('2026-10-24T10:00:00.000'),
    paymentType: PaymentType.Efectivo,
    note: 'n',
    ...overrides,
  };
}

/** Writes a raw plain-array payload, the way a legacy device left it. */
function seedRaw(expenses: unknown[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function persisted(): Expense[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

describe('ExpenseOfflineService — fundSource (expense-fund-source)', () => {
  let svc: ExpenseOfflineService;

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: makeUser(),
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    svc = new ExpenseOfflineService(storeId);
  });

  describe('create', () => {
    it('defaults a new expense with no explicit source to Externo', () => {
      const created = svc.create(makeInput()).data!;
      expect(created.fundSource).toBe(ExpenseFundSource.Externo);
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Externo);
    });

    it('persists an explicit Caja source through the at-rest write door', () => {
      svc.create(makeInput({ fundSource: ExpenseFundSource.Caja }));
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Caja);
    });

    it('persists Externo as the number 1, not as a truthy placeholder', () => {
      svc.create(makeInput());
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0]).toHaveProperty('fundSource', 1);
    });

    it('keeps Caja (0) in the payload — a falsy value is still written', () => {
      svc.create(makeInput({ fundSource: ExpenseFundSource.Caja }));
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0]).toHaveProperty('fundSource', 0);
    });
  });

  describe('legacy data', () => {
    it('reads a historical expense with no field as Externo', () => {
      seedRaw([{ id: 'legacy', type: ExpenseType.Alquiler, total: 100, isActive: true }]);
      const [expense] = svc.getStorageExpenses();
      expect(expense.fundSource).toBe(ExpenseFundSource.Externo);
    });

    it('flushes the resolved source to localStorage on the next write', () => {
      seedRaw([{ id: 'legacy', type: ExpenseType.Alquiler, total: 100, isActive: true }]);
      svc.create(makeInput());
      const legacy = persisted().find((e) => e.id === 'legacy');
      expect(legacy?.fundSource).toBe(ExpenseFundSource.Externo);
    });

    it('does not turn a legacy expense into Caja when its payment method is Efectivo', () => {
      seedRaw([
        {
          id: 'legacy-cash',
          type: ExpenseType.Alquiler,
          total: 100,
          isActive: true,
          paymentType: PaymentType.Efectivo,
        },
      ]);
      expect(svc.getStorageExpenses()[0].fundSource).toBe(ExpenseFundSource.Externo);
    });
  });

  describe('update', () => {
    it('changes the source from Externo to Caja and persists it', () => {
      const created = svc.create(makeInput()).data!;
      const updated = svc.update(created.id, { fundSource: ExpenseFundSource.Caja }).data!;
      expect(updated.fundSource).toBe(ExpenseFundSource.Caja);
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Caja);
    });

    it('leaves the source untouched when the patch omits it', () => {
      const created = svc.create(makeInput({ fundSource: ExpenseFundSource.Caja })).data!;
      svc.update(created.id, { total: 75 });
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Caja);
    });
  });

  describe('import', () => {
    it('adds an imported expense with no field as Externo', () => {
      svc.addImportedExpense({
        id: 'imp-1',
        type: ExpenseType.Otro,
        total: 30,
        date: new Date('2026-10-20T00:00:00.000'),
        paymentType: PaymentType.Efectivo,
        note: '',
        isActive: true,
      } as Expense);
      expect(persisted().find((e) => e.id === 'imp-1')?.fundSource).toBe(
        ExpenseFundSource.Externo,
      );
    });

    it('preserves an explicit Caja source on import', () => {
      svc.addImportedExpense({
        id: 'imp-2',
        type: ExpenseType.Otro,
        total: 30,
        date: new Date('2026-10-20T00:00:00.000'),
        paymentType: PaymentType.Efectivo,
        note: '',
        isActive: true,
        fundSource: ExpenseFundSource.Caja,
      } as Expense);
      expect(persisted().find((e) => e.id === 'imp-2')?.fundSource).toBe(ExpenseFundSource.Caja);
    });

    it('keeps the local classification when the import carries no field', () => {
      const created = svc.create(makeInput({ fundSource: ExpenseFundSource.Caja })).data!;
      svc.updateImportedExpense({ ...created, fundSource: undefined } as Expense);
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Caja);
    });

    it('never invents Caja for a local record that never had the field', () => {
      seedRaw([{ id: 'legacy', type: ExpenseType.Alquiler, total: 100, isActive: true }]);
      svc.getStorageExpenses();
      svc.updateImportedExpense({
        id: 'legacy',
        type: ExpenseType.Alquiler,
        total: 100,
        isActive: true,
      } as Expense);
      // El merge no trae el campo: la lectura lo resuelve a Externo y el
      // siguiente write lo materializa así — nunca como Caja.
      expect(svc.getStorageExpenses().find((e) => e.id === 'legacy')?.fundSource).toBe(
        ExpenseFundSource.Externo,
      );
      expect(persisted().find((e) => e.id === 'legacy')?.fundSource).not.toBe(
        ExpenseFundSource.Caja,
      );
    });

    it('keeps an explicit Caja source when the import carries one', () => {
      const created = svc.create(makeInput()).data!;
      svc.updateImportedExpense({ ...created, fundSource: ExpenseFundSource.Caja } as Expense);
      expect(persisted()[0].fundSource).toBe(ExpenseFundSource.Caja);
    });
  });
});
