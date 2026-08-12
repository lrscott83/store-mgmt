import { describe, it, expect, vi, afterEach } from 'vitest';
import { MissingDataKeyError } from '../entity-crypto';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

import { runGuardedAgainstMissingDek } from '../run-guarded-against-missing-dek';

describe('runGuardedAgainstMissingDek', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves true and does not call showBlockingError when fn resolves true', async () => {
    const fn = vi.fn().mockResolvedValue(true);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).resolves.toBe(true);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('resolves false and does not call showBlockingError when fn itself resolves false', async () => {
    const fn = vi.fn().mockResolvedValue(false);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).resolves.toBe(false);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });

  it('catches a MissingDataKeyError, calls showBlockingError with the given title/message, and resolves false', async () => {
    const fn = vi.fn().mockRejectedValue(new MissingDataKeyError());

    await expect(
      runGuardedAgainstMissingDek(fn, 'Error', 'No se pudieron cargar los datos. Recargue la página.'),
    ).resolves.toBe(false);

    expect(showBlockingErrorMock).toHaveBeenCalledWith(
      'Error',
      'No se pudieron cargar los datos. Recargue la página.',
    );
  });

  it('re-throws any other error and does not call showBlockingError', async () => {
    const otherError = new Error('boom');
    const fn = vi.fn().mockRejectedValue(otherError);

    await expect(runGuardedAgainstMissingDek(fn, 'Error', 'message')).rejects.toBe(otherError);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
  });
});
