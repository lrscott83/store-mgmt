import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Design §2: `device-dek-table.ts` is imported statically by
// `entity-crypto.ts`, which is imported statically by all six entity
// storage modules — it MUST be as cheap as `roster-store.ts` (zero
// top-level side effects, zero runtime imports). Same structural purity
// test as `roster-store.purity.test.ts:48-60`.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('device-dek-table — purity guard (design §2, mirrors roster-store D1)', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn<Storage, 'getItem'>>;
  let setItemSpy: ReturnType<typeof vi.spyOn<Storage, 'setItem'>>;
  let removeItemSpy: ReturnType<typeof vi.spyOn<Storage, 'removeItem'>>;

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
    await import('../device-dek-table');

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(removeItemSpy).not.toHaveBeenCalled();
  });

  it('structural: every `import` line in device-dek-table.ts is `import type` only', () => {
    const sourcePath = join(__dirname, '..', 'device-dek-table.ts');
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
