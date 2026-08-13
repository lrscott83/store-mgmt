import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MissingDataKeyError } from '../entity-crypto';
import { EntityUnreadableError } from '../read-entity-or-throw';

const showBlockingErrorMock = vi.fn();
vi.mock('../../blocking-alert', () => ({
  showBlockingError: (...args: unknown[]) => showBlockingErrorMock(...args),
}));

const logoutMock = vi.fn();
// Defaults to true: the ordinary case, where App() mounted first and registered
// the router's navigate. The cold-boot tests below flip it to false.
const willLogoutRedirectMock = vi.fn(() => true);
vi.mock('../../stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
  // root.tsx (imported by the ErrorBoundary-route suite at the bottom of this
  // file) pulls these from the same module.
  registerAuthRedirect: vi.fn(),
  willLogoutRedirect: () => willLogoutRedirectMock(),
}));

// root.tsx's module graph, stubbed only far enough to import it. None of these
// participate in what is asserted below.
vi.mock('../../pwa/service-worker-registration', () => ({ registerServiceWorker: vi.fn() }));
vi.mock('../../usage/use-store-usage-tracker', () => ({ useStoreUsageTracker: vi.fn() }));
vi.mock('react-toastify', () => ({
  ToastContainer: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
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
  willLogoutRedirectMock.mockReturnValue(true);
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

// ---------------------------------------------------------------------------
// The SECOND delivery route.
//
// A decryption failure reaches this policy by two structurally different paths,
// and the suites above only exercise one of them. A rejected promise arrives at
// the `unhandledrejection` listener (covered above, end to end: real listener,
// real event, real error). But a failure THROWN during render or in a loader
// never becomes a rejection — react-router catches it and renders the route's
// ErrorBoundary instead, which calls `handleDecryptionFailure` directly.
//
// root.test.tsx pins that ErrorBoundary calls the handler, but it does so with
// this module MOCKED, so it proves the wiring and not the outcome. Nothing else
// proved that a REAL decryption error entering by this route produces the
// message and the sign-out. These tests close that gap with the real policy.
// ---------------------------------------------------------------------------
describe('ErrorBoundary delivery route (design D5, seam 2)', () => {
  // Imported lazily so the mocks above are installed before root.tsx's module
  // graph is evaluated.
  async function renderBoundary(error: unknown) {
    const { ErrorBoundary } = await import('../../../../root');
    // `params`/`loaderData` are part of react-router's ErrorBoundary props but
    // are unread on this path.
    const props = { error, params: {} } as unknown as Parameters<typeof ErrorBoundary>[0];
    return render(<ErrorBoundary {...props} />);
  }

  it('announces a missing key that arrived as a THROW, and signs the user out', async () => {
    const { container } = await renderBoundary(new MissingDataKeyError());

    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Nothing is rendered: the policy already owns this failure, and the generic
    // error page underneath would say a second, different thing about it.
    expect(container).toBeEmptyDOMElement();
  });

  it('announces damaged data that arrived as a THROW, and signs the user out', async () => {
    const { container } = await renderBoundary(new EntityUnreadableError('k', new Error('tag')));

    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', DATA_DAMAGED);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves an unrelated route error to the generic error page, untouched', async () => {
    await renderBoundary({ status: 404, statusText: '', internal: false, data: null });

    expect(showBlockingErrorMock).not.toHaveBeenCalled();
    expect(logoutMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
  });

  it('shares the latch with the rejection route — one cause cannot produce two dialogs', async () => {
    // The two routes are separate seams but ONE policy: a page whose loader
    // throws while a parallel read rejects must still speak once.
    const unregister = registerDecryptionFailurePolicy();
    const event = new Event('unhandledrejection') as Event & { reason: unknown };
    event.reason = new MissingDataKeyError();
    window.dispatchEvent(event);

    const { container } = await renderBoundary(new MissingDataKeyError());

    expect(showBlockingErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    // Load-bearing, and the reason this test can fail: the two assertions above
    // would BOTH still hold if the ErrorBoundary were not wired to the policy at
    // all, since the rejection route already produced their one call. Rendering
    // nothing is the part that can only happen if the boundary asked the policy
    // and was told the failure was already owned.
    expect(container).toBeEmptyDOMElement();
    unregister();
  });
});

// ---------------------------------------------------------------------------
// COLD BOOT: the shape nobody writes a test for, and the one that strands a
// real user.
//
// `authRedirect` is module-level in auth-store and stays undefined until
// `App()`'s effect registers it. A root-level render or loader throw on the
// FIRST paint therefore happens before that effect has ever run, so `logout()`
// signs the user out and navigates nowhere. If the boundary still hid its UI on
// the assumption that a redirect was coming, the result is a permanently blank
// page — with no route to the recovery screens this whole design exists to
// reach.
// ---------------------------------------------------------------------------
describe('ErrorBoundary on cold boot, before any redirect is registered', () => {
  async function renderBoundary(error: unknown) {
    const { ErrorBoundary } = await import('../../../../root');
    const props = { error, params: {} } as unknown as Parameters<typeof ErrorBoundary>[0];
    return render(<ErrorBoundary {...props} />);
  }

  it('never leaves a blank page when the redirect cannot fire', async () => {
    willLogoutRedirectMock.mockReturnValue(false);

    const { container } = await renderBoundary(new MissingDataKeyError());

    // The whole point: something is on screen.
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
  });

  it('still announces the failure and still ends the session', async () => {
    willLogoutRedirectMock.mockReturnValue(false);

    await renderBoundary(new MissingDataKeyError());

    expect(showBlockingErrorMock).toHaveBeenCalledWith('Error', KEY_UNAVAILABLE);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('hides the generic page only when a redirect really is coming', async () => {
    willLogoutRedirectMock.mockReturnValue(true);

    const { container } = await renderBoundary(new MissingDataKeyError());

    expect(container).toBeEmptyDOMElement();
  });
});
