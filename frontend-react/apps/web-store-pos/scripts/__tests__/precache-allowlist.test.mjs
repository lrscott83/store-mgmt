import { describe, it, expect } from 'vitest';
import { OFFLINE_ROUTE_IDS } from '../precache-patterns.mjs';

// ── Offline allowlist pin (2026-10-22 owner decision) ───────────────────────
// The allowlist IS the contract: adding a route here makes every installed
// device download it. The built-output invariants derive their "allowed" set
// from this same list, so they cannot catch an accidental addition on their
// own — that is why the exact ids are pinned here. Changing this list is a
// deliberate act: edit the test with the requirement that motivates it.
const PINNED = [
  'root',
  'home/routes/landing-deep',
  'shared/routes/$',
  'auth/components/auth-layout',
  'auth/routes/login',
  'auth/routes/provision',
  'app-layout',
  'sales/routes/products',
  'sales/routes/sale',
  'sales/routes/cash-closing',
  'sales/routes/wholesale',
  'sales/routes/today-orders',
  'sales/routes/orders',
  'sales/routes/today-stats',
  'sales/routes/today-credits',
  'sales/routes/credits',
  'inventory/routes/available',
  'inventory/routes/count',
  'inventory/routes/today-entries',
  'inventory/routes/entries',
  'inventory/routes/today-quantities',
  'inventory/routes/today-sales-profit',
  'inventory/routes/egress',
  'inventory/routes/warehouses',
  'inventory/routes/warehouse-movements',
  'inventory/routes/recipes',
  'inventory/routes/elaborations',
  'expenses/routes/today-expenses',
  'expenses/routes/expenses-history',
  'reports/routes/today-report',
  'statistics/routes/dashboard',
  'statistics/routes/cuadre-por-fechas',
  'sync/routes/export',
  'sync/routes/import',
  'management-channel-rates',
  'public-app-layout',
  'diagnostics/routes/diagnostics',
  'help/routes/tutorial',
  'legal/routes/privacy-policy',
  'legal/routes/terms-conditions',
];

describe('offline allowlist', () => {
  it('pins exactly the 40 approved route ids', () => {
    expect([...OFFLINE_ROUTE_IDS].sort()).toEqual([...PINNED].sort());
    expect(OFFLINE_ROUTE_IDS).toHaveLength(40);
  });

  it('keeps the owner exceptions inside the list', () => {
    expect(OFFLINE_ROUTE_IDS).toContain('management-channel-rates');
    expect(OFFLINE_ROUTE_IDS).toContain('diagnostics/routes/diagnostics');
  });

  it('never contains an API-only route', () => {
    const forbidden =
      /^(?:auth\/routes\/register|sales\/routes\/web-catalog|sales\/routes\/ordering-|catalog\/routes\/public-catalog|admin\/|profile\/|shared\/routes\/health)/;

    expect(OFFLINE_ROUTE_IDS.filter((id) => forbidden.test(id))).toEqual([]);
    expect(
      OFFLINE_ROUTE_IDS.filter(
        (id) => id.startsWith('management') && id !== 'management-channel-rates',
      ),
    ).toEqual([]);
  });
});
