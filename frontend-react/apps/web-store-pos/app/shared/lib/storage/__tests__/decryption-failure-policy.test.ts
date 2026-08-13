import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissingDataKeyError } from '../entity-crypto';
import { EntityUnreadableError } from '../read-entity-or-throw';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const logoutMock = vi.fn();
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
}));

import {
  classifyDecryptionFailure,
  handleDecryptionFailure,
  registerDecryptionFailurePolicy,
  resetDecryptionFailureLatch,
} from '../decryption-failure-policy';

const KEY_UNAVAILABLE =
  'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.';
const DATA_DAMAGED =
  'La información guardada en este dispositivo está dañada y no se pudo leer. No se borró nada.';

beforeEach(() => {
  vi.clearAllMocks();
  resetDecryptionFailureLatch();
});

describe('classifyDecryptionFailure', () => {
  it('classifies a missing key as recoverable', () => {
    expect(classifyDecryptionFailure(new MissingDataKeyError())).toBe('missing-key');
  });

  it('classifies unreadable bytes as damaged', () => {
    expect(classifyDecryptionFailure(new EntityUnreadableError('k', new Error('tag')))).toBe(
      'damaged',
    );
  });

  it('classifies anything else as not ours — the policy must never become a catch-all', () => {
    expect(classifyDecryptionFailure(new TypeError('unrelated'))).toBeNull();
    expect(classifyDecryptionFailure(undefined)).toBeNull();
    expect(classifyDecryptionFailure(null)).toBeNull();
    expect(classifyDecryptionFailure('MissingDataKeyError')).toBeNull();
  });

  it('classifies by `name`, not by class identity — these errors cross dynamic-import boundaries', () => {
    // A structurally identical error minted by a DIFFERENT module instance: the
    // class this module closed over would fail `instanceof`, the name matches.
    class ForeignMissingDataKeyError extends Error {
      readonly name = 'MissingDataKeyError';
    }
    const foreign = new ForeignMissingDataKeyError();
    expect(foreign instanceof MissingDataKeyError).toBe(false);
    expect(classifyDecryptionFailure(foreign)).toBe('missing-key');
  });
});

describe('handleDecryptionFailure', () => {
  it('shows the recoverable message and signs the user out on a missing key', () => {
    expect(handleDecryptionFailure(new MissingDataKeyError())).toBe(true);
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('tells the truth on damaged data — no promise of recovery — and still signs out', () => {
    expect(handleDecryptionFailure(new EntityUnreadableError('k', new Error('tag')))).toBe(true);
    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', DATA_DAMAGED);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all for an unrelated error', () => {
    expect(handleDecryptionFailure(new TypeError('unrelated'))).toBe(false);
    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('shows one message per failure even when several arrive together', () => {
    handleDecryptionFailure(new MissingDataKeyError());
    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('still reports handled=true for the failures the latch swallowed', () => {
    // The listener seam calls `preventDefault()` on a `true`, so a latched
    // second rejection must not fall through to the console as unhandled.
    handleDecryptionFailure(new MissingDataKeyError());
    expect(handleDecryptionFailure(new MissingDataKeyError())).toBe(true);
  });

  it('latches across the two kinds — one cause, one dialog, whichever arrives second', () => {
    handleDecryptionFailure(new MissingDataKeyError());
    handleDecryptionFailure(new EntityUnreadableError('k', new Error('tag')));
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('collapses the real parallel case: two entity reads rejecting from one cause', async () => {
    // The hazard in prose: a screen loads categories and products together, so
    // ONE absent key produces TWO rejections. `Promise.allSettled` reproduces
    // that shape — both reject before either handler runs.
    const results = await Promise.allSettled([
      Promise.reject(new MissingDataKeyError()),
      Promise.reject(new MissingDataKeyError()),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') handleDecryptionFailure(result.reason);
    }
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('announces again after a successful login cleared the latch', () => {
    handleDecryptionFailure(new MissingDataKeyError());
    resetDecryptionFailureLatch();
    handleDecryptionFailure(new MissingDataKeyError());
    expect(showBlockingErrorMock).toHaveBeenCalledTimes(2);
  });
});

describe('registerDecryptionFailurePolicy', () => {
  it('handles a decryption failure that arrives as an unhandled rejection, and stops it there', () => {
    const unregister = registerDecryptionFailurePolicy();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new MissingDataKeyError();
    const preventDefault = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('leaves an unrelated rejection alone — it must still surface as unhandled', () => {
    const unregister = registerDecryptionFailurePolicy();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new TypeError('unrelated');
    const preventDefault = vi.spyOn(event, 'preventDefault');

    window.dispatchEvent(event);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    unregister();
  });

  it('stops listening once unregistered', () => {
    const unregister = registerDecryptionFailurePolicy();
    unregister();

    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new MissingDataKeyError();
    window.dispatchEvent(event);

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
