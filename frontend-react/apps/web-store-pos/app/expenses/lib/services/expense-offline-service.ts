import type { Expense } from '@store-mgmt/domain';
import type { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { BaseRepository } from '~/shared/lib/storage/base-repository';
import { startOfDay, addDays } from '~/shared/lib/date-utils';

const repo = new BaseRepository<Expense>('expenses', ['date', 'createdDate', 'updatedDate']);

function generateId(): string {
  return crypto.randomUUID();
}

interface CreateExpenseInput {
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  note?: string | null;
}

export class ExpenseOfflineService {
  constructor(private readonly storeId: string) {}

  getAll(): Expense[] {
    return Array.from(repo.getAll(this.storeId).values());
  }

  getById(id: string): Expense | undefined {
    return repo.getById(this.storeId, id);
  }

  getByDateRange(from: Date, to: Date): Expense[] {
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    return this.getAll().filter(
      (e) => e.date >= start && e.date < end,
    );
  }

  getActiveToday(): Expense[] {
    return this.getByDateRange(new Date(), new Date());
  }

  create(input: CreateExpenseInput): Expense {
    const now = new Date();
    const expense: Expense = {
      id: generateId(),
      type: input.type,
      total: input.total,
      date: input.date,
      paymentType: input.paymentType,
      note: input.note || '',
      isActive: true,
      createdDate: now,
      createdByName: '',
      updatedDate: now,
      updatedByName: '',
    };
    repo.upsert(this.storeId, expense);
    return expense;
  }

  update(
    id: string,
    patch: Partial<Pick<Expense, 'type' | 'total' | 'date' | 'paymentType' | 'note'>>,
  ): Expense {
    const existing = repo.getById(this.storeId, id);
    if (!existing) throw new Error(`Expense not found: ${id}`);
    const updated: Expense = {
      ...existing,
      ...patch,
      note: patch.note !== undefined ? (patch.note || '') : existing.note,
      updatedDate: new Date(),
    };
    repo.upsert(this.storeId, updated);
    return updated;
  }

  delete(id: string): void {
    repo.remove(this.storeId, id);
  }
}
