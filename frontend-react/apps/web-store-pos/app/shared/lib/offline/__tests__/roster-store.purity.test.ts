import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Design D1 (load-bearing decision) + spec offline-roster-bundle "Roster
// storage module has no top-level side effects": `roster-store.ts` is loaded
// via a dynamic `import()` on EVERY login submission, including from users
// who never provisioned a device. Any top-level side effect (localStorage
// read/write, or any runtime import that could carry one) would run
// unconditionally on every login and violate the headline
// unprovisioned-device-unchanged invariant.
//
// This test lands EARLY (Task 2) — before Task 3/4 build out the real
// bodies — so it fails loudly the moment either guard is violated, rather
// than relying on discipline.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('roster-store — purity guard (D1)', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;
  let removeItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
  });

  afterEach(() => {
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
    vi.resetModules();
  });

  it('behavioral: importing the module performs zero localStorage reads/writes', async () => {
    vi.resetModules();
    await import('../roster-store');

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it('structural: every `import` line in roster-store.ts is `import type` only', () => {
    const sourcePath = join(__dirname, '..', 'roster-store.ts');
    const source = readFileSync(sourcePath, 'utf-8');
    const importLines = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('import '));

    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line.startsWith('import type ')).toBe(true);
    }
  });
});
