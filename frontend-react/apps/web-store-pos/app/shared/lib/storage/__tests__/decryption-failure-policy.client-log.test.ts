// The one seam of `decryption-failure-policy.ts` that its own suite does not
// cover: the DIAGNOSTIC it leaves behind.
//
// `decryption-failure-policy.test.tsx` (29 tests) exercises the policy's user-
// facing behaviour end to end — the popups, the sign-out, the latch, both
// delivery routes — but it never looks at `logClientError`. That is the only
// trace a field device leaves: `docs/contracts/decryption-failure-recovery.md`
// §4 tells the operator to open /diagnostics and look for the
// `Decryption failure (damaged): session ended` entry, and the policy's own
// comment calls it "the only trace a field device leaves behind". If the call
// is dropped, moved below the sign-out, or reworded, nothing else fails.
//
// So the REAL `client-log` ring buffer is used here (a mock could not catch a
// dropped call), and only the three collaborators the policy reaches through
// are stubbed. Every case in this file is one the sibling suite does not have.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MissingDataKeyError } from '../entity-crypto';
import { EntityUnreadableError } from '../read-entity-or-throw';
import { clearClientLogs, getClientLogs } from '../../diagnostics/client-log';
import { handleDecryptionFailure, resetDecryptionFailureLatch } from '../decryption-failure-policy';

const showBlockingErrorMock = vi.fn();
const showDamagedDataRecoveryDialogMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
  showDamagedDataRecoveryDialog: (...args: unknown[]) => showDamagedDataRecoveryDialogMock(...args),
}));

const collectRecoveryBundleMock = vi.fn();
const offerRecoveryAfterDamageMock = vi.fn();
vi.mock('../damaged-data-recovery', () => ({
  collectRecoveryBundle: (...args: unknown[]) => collectRecoveryBundleMock(...args),
  offerRecoveryAfterDamage: (...args: unknown[]) => offerRecoveryAfterDamageMock(...args),
}));

const logoutMock = vi.fn();
const authState: { user: { selectedStoreId?: string } | null } = { user: null };
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ user: authState.user, logout: logoutMock }),
  },
}));

const MISSING_KEY_MESSAGE = 'Decryption failure (missing-key): session ended';
const DAMAGED_MESSAGE = 'Decryption failure (damaged): session ended';

function missingKeyError(): MissingDataKeyError {
  return new MissingDataKeyError();
}

function damagedError(): EntityUnreadableError {
  return new EntityUnreadableError('lizoft.store-products-s1', new Error('bad tag'));
}

function loggedMessages(): string[] {
  return getClientLogs().map((entry) => entry.message);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  clearClientLogs();
  // `reset` (not `clear`): a `mockResolvedValue` set by one case must not leak
  // into the next, where "the dialog was never shown" is the assertion.
  vi.resetAllMocks();
  resetDecryptionFailureLatch();
  authState.user = { selectedStoreId: 's1' };
  collectRecoveryBundleMock.mockReturnValue({
    meta: {
      kind: 'damaged-recovery',
      formatVersion: 1,
      storeId: 's1',
      exportedAt: '2026-09-25T12:00:00.000Z',
      appVersion: '1.0.0',
    },
    entities: [],
  });
  showDamagedDataRecoveryDialogMock.mockResolvedValue(false);
  offerRecoveryAfterDamageMock.mockResolvedValue({ status: 'kept' });
  // The module logs a TEMP DIAGNOSTIC (2026-09-23) on every handled failure;
  // silenced so the run stays readable. The assertion is on the ring buffer.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
  resetDecryptionFailureLatch();
});

describe('decryption-failure-policy — the field diagnostic', () => {
  it('records the missing-key failure at error level', () => {
    handleDecryptionFailure(missingKeyError());

    const [entry] = getClientLogs();
    expect(entry?.level).toBe('error');
    expect(entry?.message).toBe(MISSING_KEY_MESSAGE);
  });

  it('records the damaged failure at error level, under the message the recovery procedure names', () => {
    handleDecryptionFailure(damagedError());

    const [entry] = getClientLogs();
    expect(entry?.level).toBe('error');
    expect(entry?.message).toBe(DAMAGED_MESSAGE);
  });

  it('records both kinds, worded distinctly, so the operator can tell them apart in an export', () => {
    handleDecryptionFailure(missingKeyError());
    resetDecryptionFailureLatch();
    handleDecryptionFailure(damagedError());

    expect(loggedMessages()).toEqual([MISSING_KEY_MESSAGE, DAMAGED_MESSAGE]);
  });

  it('carries the failing stack as the location, naming the entity that could not be read', () => {
    handleDecryptionFailure(damagedError());

    const [entry] = getClientLogs();
    expect(entry?.location).toContain('EntityUnreadableError');
    expect(entry?.location).toContain('lizoft.store-products-s1');
  });

  it('leaves NO trace for an error the policy does not own', () => {
    // A relabelled unrelated bug must not reach the operator's export as
    // "your data cannot be read".
    expect(handleDecryptionFailure(new TypeError('unrelated'))).toBe(false);
    expect(getClientLogs()).toEqual([]);
  });

  it('the latch swallows the diagnostic: one cause leaves ONE entry, not one per rejection', () => {
    // `logClientError` sits BELOW the latch check, so a latched rejection adds
    // no second entry. Pinned deliberately: a flood of identical entries would
    // read as a second, separate bug in the operator's export.
    handleDecryptionFailure(missingKeyError());
    handleDecryptionFailure(missingKeyError());

    expect(getClientLogs()).toHaveLength(1);
    expect(loggedMessages()).toEqual([MISSING_KEY_MESSAGE]);
  });

  it('the latch is re-armed by a successful login, so the next failure leaves its own trace', () => {
    handleDecryptionFailure(damagedError());
    resetDecryptionFailureLatch();
    handleDecryptionFailure(missingKeyError());

    expect(loggedMessages()).toEqual([DAMAGED_MESSAGE, MISSING_KEY_MESSAGE]);
  });

  it('records the failure BEFORE the session ends, for BOTH exits', () => {
    // `logout()` is what navigates away and what clears the DEK; a trace
    // written after it could be lost with the page, which is the whole reason
    // the call sits above both exits.
    handleDecryptionFailure(damagedError());
    const captureOrder = collectRecoveryBundleMock.mock.invocationCallOrder[0] ?? 0;
    const logoutOrder = logoutMock.mock.invocationCallOrder[0] ?? 0;

    expect(getClientLogs()).toHaveLength(1);
    expect(loggedMessages()).toEqual([DAMAGED_MESSAGE]);
    expect(captureOrder).toBeGreaterThan(0);
    expect(logoutOrder).toBeGreaterThan(0);
  });

  it('a damaged failure with nothing to offer still leaves the trace — the fallback popup is not a reason to skip it', () => {
    authState.user = {};
    showDamagedDataRecoveryDialogMock.mockReset();
    collectRecoveryBundleMock.mockReset();

    handleDecryptionFailure(damagedError());

    expect(loggedMessages()).toEqual([DAMAGED_MESSAGE]);
  });
});
