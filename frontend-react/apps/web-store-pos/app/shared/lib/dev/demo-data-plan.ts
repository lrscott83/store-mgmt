import { ExpenseType, PaymentType } from '@store-mgmt/domain';

/**
 * DEMO-SEED — pure, deterministic planner for dev-only demo data.
 *
 * Produces ~90 days of local activity (orders without credits, cycling the three
 * payment types) plus monthly expenses (salary, transport, rent, utilities, taxes)
 * for the same window. Kept free of app IO (no services / storage) so the schedule
 * can be unit-tested; the IO runner lives in `demo-data-generator.ts`.
 *
 * All randomness is a seeded LCG (mulberry32) so re-runs are byte-identical.
 */

export interface DemoProductSpec {
  id: string;
  /** Product sale price (used per unit). */
  price: number;
  /** Initial units available (inventory cap the planner must never exceed). */
  available: number;
}

export interface PlannedSaleItem {
  productId: string;
  quantity: number;
}

export interface PlannedOrder {
  date: Date;
  paymentType: PaymentType;
  items: PlannedSaleItem[];
}

export interface PlannedExpense {
  date: Date;
  type: ExpenseType;
  total: number;
  paymentType: PaymentType;
  note: string;
}

export interface DemoPlan {
  orders: PlannedOrder[];
  expenses: PlannedExpense[];
  summary: {
    orderCount: number;
    expenseCount: number;
    soldUnitsByProduct: Record<string, number>;
  };
}

/** Days of history the generator covers (today included). */
export const DEMO_WINDOW_DAYS = 90;

/** Cycle roughly 60/20/20 — cash first, card and Zelle mixed in, no credit. */
const PAYMENT_CYCLE: PaymentType[] = [
  PaymentType.Efectivo,
  PaymentType.Tarjeta,
  PaymentType.Efectivo,
  PaymentType.Zelle,
  PaymentType.Efectivo,
];

/**
 * Monthly expense calendar (day-of-month -> [type, base total, note]).
 * Values are in CUP on the same scale as the product catalog.
 */
const MONTHLY_EXPENSES: ReadonlyArray<readonly [number, ExpenseType, number, string]> = [
  [3, ExpenseType.Alquiler, 15000, 'Alquiler del local'],
  [5, ExpenseType.Salario, 12000, 'Salario (quincena)'],
  [8, ExpenseType.Transporte, 900, 'Combustible / transporte'],
  [10, ExpenseType.Corriente, 8000, 'Electricidad'],
  [12, ExpenseType.Agua, 1500, 'Agua'],
  [15, ExpenseType.Transporte, 1100, 'Combustible / transporte'],
  [18, ExpenseType.Operaciones, 2200, 'Bolsas, limpieza y operaciones'],
  [20, ExpenseType.Salario, 12000, 'Salario (quincena)'],
  [22, ExpenseType.Transporte, 800, 'Combustible / transporte'],
  [25, ExpenseType.Impuesto, 6200, 'Impuestos / contribución'],
  [28, ExpenseType.Transporte, 1200, 'Combustible / transporte'],
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** First day of the month `offset` months before `anchor` (0 = current month). */
function monthStart(anchor: Date, offset: number): Date {
  return new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Round to 2 decimals — same convention the order services use for totals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic demo plan.
 *
 * - Orders: every day of the last DEMO_WINDOW_DAYS days (oldest first) has at least
 *   one sale; busier and larger orders as it approaches today so the 30-day charts
 *   and today/yesterday KPIs look alive. Never exceeds each product's `available`
 *   (inventory ledger enforced here).
 * - Payment types rotate through Efectivo/Tarjeta/Zelle (no credit anywhere).
 * - Expenses: monthly calendar (salary, transport, rent, electricity, water, ops,
 *   taxes) for the 3 calendar months of the window; the current month only includes
 *   events up to `anchor` (today).
 */
export function buildDemoPlan(
  products: DemoProductSpec[],
  anchor: Date,
  seed = 20260903,
): DemoPlan {
  const rnd = mulberry32(seed);
  const eligible = products.filter((p) => p.available > 0 && p.price > 0);

  const orders: PlannedOrder[] = [];
  const expenses: PlannedExpense[] = [];
  const soldUnitsByProduct: Record<string, number> = {};
  const remaining: Record<string, number> = {};
  for (const p of eligible) remaining[p.id] = p.available;

  let paymentIndex = 0;
  const nextPayment = (): PaymentType => PAYMENT_CYCLE[paymentIndex++ % PAYMENT_CYCLE.length];

  // ── Orders: oldest → today ────────────────────────────────────────────────
  for (let dayOffset = DEMO_WINDOW_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const dayDate = addLocalDays(anchor, -dayOffset);
    const recency = (DEMO_WINDOW_DAYS - 1 - dayOffset) / (DEMO_WINDOW_DAYS - 1); // 0 old → 1 today
    let ordersInDay = 1 + Math.floor(recency * 3); // 1..4
    if (rnd() < recency * 0.3) ordersInDay += 1;
    if (ordersInDay > 5) ordersInDay = 5;

    for (let o = 0; o < ordersInDay; o++) {
      const items: PlannedSaleItem[] = [];
      const itemSlots = 1 + Math.floor(rnd() * 2) + (rnd() < recency * 0.5 ? 1 : 0);
      for (let s = 0; s < itemSlots; s++) {
        if (eligible.length === 0) break;
        // Weighted pick: prefer still-stocked products; restart scan once exhausted.
        const start = Math.floor(rnd() * eligible.length);
        let product: DemoProductSpec | undefined;
        for (let k = 0; k < eligible.length; k++) {
          const candidate = eligible[(start + k) % eligible.length];
          if ((remaining[candidate.id] ?? 0) > 0) {
            product = candidate;
            break;
          }
        }
        if (!product) break;
        const cap = Math.min(5, remaining[product.id] ?? 0);
        if (cap <= 0) break;
        // 1 unit mostly; occasional 2; rare bulk (rice/oil-style) up to 5.
        let quantity = 1;
        const roll = rnd();
        if (roll < 0.18) quantity = 2;
        else if (roll < 0.24) quantity = 3;
        else if (roll < 0.27) quantity = 5;
        quantity = Math.max(1, Math.min(cap, quantity));

        items.push({ productId: product.id, quantity });
        remaining[product.id] = (remaining[product.id] ?? 0) - quantity;
        soldUnitsByProduct[product.id] = (soldUnitsByProduct[product.id] ?? 0) + quantity;
      }
      if (items.length === 0) continue;

      // Spread order times across the business day (08:00–19:00).
      const hour = 8 + Math.floor(rnd() * 12);
      const minute = Math.floor(rnd() * 60);
      const date = new Date(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate(),
        hour,
        minute,
      );
      orders.push({ date, paymentType: nextPayment(), items });
    }
  }

  orders.sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── Expenses: 3 calendar months (2 previous + current, clipped to today) ──
  const todayStart = startOfLocalDay(anchor);
  for (let monthOffset = 2; monthOffset >= 0; monthOffset--) {
    const start = monthStart(anchor, monthOffset);
    const lastDom = daysInMonth(start);
    const isCurrentMonth = monthOffset === 0;
    for (const [dom, type, baseTotal, note] of MONTHLY_EXPENSES) {
      if (dom > lastDom) continue;
      const when = new Date(start.getFullYear(), start.getMonth(), dom, 12, 0);
      if (isCurrentMonth && when > todayStart) continue;
      // ±10 % organic variation per month, integer result.
      const variation = 0.9 + rnd() * 0.2;
      const total = round2(Math.max(1, Math.round(baseTotal * variation)));
      expenses.push({
        date: when,
        type,
        total,
        paymentType: nextPayment(),
        note,
      });
    }
  }

  expenses.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    orders,
    expenses,
    summary: {
      orderCount: orders.length,
      expenseCount: expenses.length,
      soldUnitsByProduct,
    },
  };
}
