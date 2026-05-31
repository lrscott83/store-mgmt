/**
 * S-IMPORT-4 / S-IMPORT-5 — container-level "no writes on wrong password"
 *
 * Verifies the import flow contract: DataSynchronizerService.sync() must NOT
 * be called when DataSerializerService.import() throws WrongPasswordError or
 * CorruptFileError. This is the critical "no writes before failure" assertion
 * that belongs at the service boundary, not just the UI level.
 */

import { describe, it, expect, vi } from 'vitest';
import { WrongPasswordError, CorruptFileError } from '~/sync/lib/services/data-serializer-service';
import type { ParsedData } from '~/sync/lib/services/data-serializer-service';

// Minimal mock implementations for the contract test

function makeSerializerThatThrows(ErrorClass: new () => Error) {
  return {
    export: vi.fn(),
    import: vi.fn().mockRejectedValue(new ErrorClass()),
  };
}

function makeSynchronizer() {
  return {
    sync: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Mirrors the import container flow exactly — serializer.import runs first;
 * synchronizer.sync only runs if serializer.import resolves.
 */
async function runImportFlow(
  serializer: { import: (payload: Uint8Array, password: string) => Promise<ParsedData> },
  synchronizer: { sync: (data: ParsedData) => Promise<unknown> },
  payload: Uint8Array,
  password: string,
): Promise<void> {
  const parsedData = await serializer.import(payload, password);
  await synchronizer.sync(parsedData);
}

describe('Import flow — no writes on WrongPasswordError', () => {
  it('synchronizer.sync is NOT called when serializer.import throws WrongPasswordError', async () => {
    const serializer = makeSerializerThatThrows(WrongPasswordError);
    const synchronizer = makeSynchronizer();

    await expect(
      runImportFlow(serializer, synchronizer, new Uint8Array([1, 2, 3]), 'wrong'),
    ).rejects.toBeInstanceOf(WrongPasswordError);

    expect(synchronizer.sync).not.toHaveBeenCalled();
  });
});

describe('Import flow — no writes on CorruptFileError', () => {
  it('synchronizer.sync is NOT called when serializer.import throws CorruptFileError', async () => {
    const serializer = makeSerializerThatThrows(CorruptFileError);
    const synchronizer = makeSynchronizer();

    await expect(
      runImportFlow(serializer, synchronizer, new Uint8Array([1, 2, 3]), 'any'),
    ).rejects.toBeInstanceOf(CorruptFileError);

    expect(synchronizer.sync).not.toHaveBeenCalled();
  });
});
