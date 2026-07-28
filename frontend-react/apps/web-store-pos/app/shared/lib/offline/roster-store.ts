// roster-store.ts — NOT a zustand store (design D7: kept this name because
// the proposal/spec/rollback plan all name it this way; renaming to
// `roster-storage.ts` would be pure artifact drift for no gain).
//
// PURITY CONTRACT (design D1, load-bearing): this module is loaded via a
// dynamic `import()` on EVERY login submission, including from devices that
// never provisioned a roster. It therefore MUST NOT perform any top-level
// side effect (localStorage access, or any runtime import that could carry
// one) — evaluating this file can only ever cost 2 string consts + a few
// class/function declarations. Guarded by
// `__tests__/roster-store.purity.test.ts` (behavioral + structural).
//
// ONLY `import type` is allowed below. Task 4 fills in the real bodies of
// the functions stubbed here.
import type { OfflineRosterBundle, OfflineRosterUser } from './roster-types';

export function importRoster(_bundle: OfflineRosterBundle, _now?: number): void {
  throw new Error('roster-store.importRoster: not implemented yet (Task 4)');
}

export function getRoster(_now?: number): OfflineRosterBundle | null {
  throw new Error('roster-store.getRoster: not implemented yet (Task 4)');
}

export function findRosterUser(_login: string, _now?: number): OfflineRosterUser | null {
  throw new Error('roster-store.findRosterUser: not implemented yet (Task 4)');
}

export function isRosterProvisioned(_now?: number): boolean {
  throw new Error('roster-store.isRosterProvisioned: not implemented yet (Task 4)');
}

export function clearRoster(): void {
  throw new Error('roster-store.clearRoster: not implemented yet (Task 4)');
}
