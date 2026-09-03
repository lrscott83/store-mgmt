import { describe, expect, it } from 'vitest';
import { ExpenseType, PaymentType } from '@store-mgmt/domain';
import { buildDemoPlan, DEMO_WINDOW_DAYS, type DemoProductSpec } from '../demo-data-plan';

const ANCHOR = new Date(2026, 8, 26, 12, 0, 0); // 26 Sep 2026 (local) — mid/late month so the current-month bucket has events

function bigCatalog(): DemoProductSpec[] {
  // 10 products × plenty of stock so every one of the 90 days gets sales.
  return Array.from({ length: 10 }, (_, i) => ({
    id: `p${i + 1}`,
    price: 100 + i * 50,
    available: 500,
  }));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

describe('buildDemoPlan', () => {
  it('is deterministic for the same seed, catalog and anchor', () => {
    const a = buildDemoPlan(bigCatalog(), ANCHOR);
    const b = buildDemoPlan(bigCatalog(), ANCHOR);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('covers the full 90-day window with at least one order per day', () => {
    const plan = buildDemoPlan(bigCatalog(), ANCHOR);
    expect(plan.orders.length).toBeGreaterThan(0);

    const oldest = startOfDay(new Date(ANCHOR.getFullYear(), ANCHOR.getMonth(), ANCHOR.getDate() - (DEMO_WINDOW_DAYS - 1)));
    const newest = startOfDay(ANCHOR);
    const byDay = new Map<string, number>();
    for (const order of plan.orders) {
      const day = startOfDay(order.date).getTime();
      byDay.set(String(day), (byDay.get(String(day)) ?? 0) + 1);
      expect(order.date.getTime()).toBeGreaterThanOrEqual(oldest.getTime());
      expect(order.date.getTime()).toBeLessThan(newest.getTime() + 86_400_000);
    }
    expect(byDay.size).toBe(DEMO_WINDOW_DAYS);
  });

  it('never exceeds product availability across the whole plan', () => {
    const catalog = bigCatalog();
    const plan = buildDemoPlan(catalog, ANCHOR);
    const remaining = new Map(catalog.map((p) => [p.id, p.available]));
    for (const order of plan.orders) {
      for (const item of order.items) {
        const left = remaining.get(item.productId) ?? 0;
        expect(left).toBeGreaterThanOrEqual(item.quantity);
        remaining.set(item.productId, left - item.quantity);
      }
    }
    for (const [, left] of remaining) {
      expect(left).toBeGreaterThanOrEqual(0);
    }
  });

  it('uses only the three payment types and includes all of them (no credit anywhere)', () => {
    const plan = buildDemoPlan(bigCatalog(), ANCHOR);
    const used = new Set(plan.orders.map((o) => o.paymentType));
    expect(used).toEqual(
      new Set([PaymentType.Efectivo, PaymentType.Tarjeta, PaymentType.Zelle]),
    );
    // The planner has no credit concept — there is nothing carrying a client/isCredit.
    for (const order of plan.orders) {
      expect(order.items.length).toBeGreaterThan(0);
      for (const item of order.items) {
        expect(item.quantity).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('schedules salario and transporte (plus other monthly costs) in each of the 3 months', () => {
    const plan = buildDemoPlan(bigCatalog(), ANCHOR);
    expect(plan.expenses.length).toBeGreaterThan(0);

    const byMonth = new Map<string, { salario: boolean; transporte: boolean; total: number }>();
    for (const expense of plan.expenses) {
      const key = `${expense.date.getFullYear()}-${expense.date.getMonth()}`;
      const bucket = byMonth.get(key) ?? { salario: false, transporte: false, total: 0 };
      if (expense.type === ExpenseType.Salario) bucket.salario = true;
      if (expense.type === ExpenseType.Transporte) bucket.transporte = true;
      bucket.total += expense.total;
      byMonth.set(key, bucket);
    }
    expect(byMonth.size).toBe(3);
    for (const [, bucket] of byMonth) {
      expect(bucket.salario).toBe(true);
      expect(bucket.transporte).toBe(true);
      expect(bucket.total).toBeGreaterThan(0);
    }
  });

  it('clips the current month to today (no future-dated expense)', () => {
    const plan = buildDemoPlan(bigCatalog(), ANCHOR);
    const currentKey = `${ANCHOR.getFullYear()}-${ANCHOR.getMonth()}`;
    const today = startOfDay(ANCHOR).getTime();
    for (const expense of plan.expenses) {
      const key = `${expense.date.getFullYear()}-${expense.date.getMonth()}`;
      if (key === currentKey) {
        expect(expense.date.getTime()).toBeLessThanOrEqual(today);
      }
    }
  });
});
