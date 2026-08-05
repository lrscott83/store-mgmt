export interface TestIdentity {
  login: string;
  storeName: string;
  fullName: string;
  cellPhone: string;
  password: string;
}

/**
 * Builds a unique identity for one Playwright test run against the real
 * backend (design.md §7).
 *
 * `login` shape: `e2e-{YYYYMMDD}T{HHmmss}-{6 base36 chars}` — three parts,
 * each earning its place:
 * - `e2e-` prefix: makes the resulting `Owner`/`Store` rows greppable and
 *   deletable by hand in the local `smca` database. There is no teardown
 *   reachable from the browser (see e2e/README.md) — this prefix is the
 *   entire mitigation for that.
 * - Timestamp: orderable, so "delete everything before yesterday" is a
 *   trivial filter later.
 * - 6-char random suffix: avoids collisions between parallel workers landing
 *   in the same second — a real scenario under `fullyParallel: true`
 *   (playwright.config.ts), not a theoretical one.
 *
 * Call this once per test. The one sanctioned exception is the
 * `describe.serial` block in register.spec.ts (REQ-8 + REQ-6), where both
 * tests deliberately share a single identity generated once in the block —
 * see design.md §5 and §7.
 */
export function newTestIdentity(): TestIdentity {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const timestamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0');

  return {
    login: `e2e-${timestamp}-${suffix}`,
    storeName: `E2E Store ${timestamp}-${suffix}`,
    // Fixed values (design.md §7): they do not participate in uniqueness,
    // they only need to satisfy their own field's validation.
    fullName: 'E2E Owner',
    cellPhone: '1100000000',
    // Satisfies the CLIENT policy regex (register.tsx:57,
    // `/^(?=.*[A-Z])(?=.*\d).{8,}$/`), which is stricter than the server's
    // (design.md H2 alternatives table) — anything that clears this clears
    // the backend too.
    password: 'E2eTest1234',
  };
}
