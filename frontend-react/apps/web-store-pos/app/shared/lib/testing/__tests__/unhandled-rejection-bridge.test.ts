// The bridge installed by `vitest.setup.ts` is load-bearing for every suite in
// this app, and its failure mode is silent, total and global: delete its
// `throw` and all 197 files go blind to unhandled rejections while every gate
// stays green. Its correctness was originally established by manual probes,
// which never run again. This is those probes, kept.
//
// It grabs the real registered handler rather than reimplementing it — a copy
// of the logic here would keep passing after the real one was broken.
import { describe, it, expect } from 'vitest';
import { MissingDataKeyError } from '~/shared/lib/storage/entity-crypto';

type RejectionHandler = (reason: unknown, promise: Promise<unknown>) => void;

function registeredHandlers(): RejectionHandler[] {
  return process.listeners('unhandledRejection') as unknown as RejectionHandler[];
}

/**
 * Feeds `reason` to every registered handler and reports whether any of them
 * re-threw it. Asking "did ANY handler throw" rather than indexing into the
 * array keeps this independent of registration order, which vitest controls.
 */
function anyHandlerThrows(reason: unknown): boolean {
  let threw = false;
  for (const handler of registeredHandlers()) {
    try {
      handler(reason, Promise.resolve());
    } catch {
      threw = true;
    }
  }
  return threw;
}

function withClaimingListener<T>(run: () => T): T {
  const claim = (event: Event) => event.preventDefault();
  window.addEventListener('unhandledrejection', claim);
  try {
    return run();
  } finally {
    window.removeEventListener('unhandledrejection', claim);
  }
}

describe('vitest.setup unhandledRejection -> window bridge', () => {
  it('is actually installed', () => {
    expect(registeredHandlers().length).toBeGreaterThan(0);
  });

  it('re-throws a reason nobody claims, so the run still fails', () => {
    // The assertion that dies if `if (!claimed) throw reason;` is deleted.
    expect(anyHandlerThrows(new TypeError('nobody claims me'))).toBe(true);
  });

  it('re-throws a DECRYPTION reason too when no policy is registered to claim it', () => {
    // The bridge must be content-agnostic. If it ever special-cased the app's
    // own errors it would be `dangerouslyIgnoreUnhandledErrors` wearing a
    // better name, and this is what would catch that.
    expect(anyHandlerThrows(new MissingDataKeyError())).toBe(true);
  });

  it('re-throws a non-Error reason rather than dropping it', () => {
    expect(anyHandlerThrows('a bare string rejection')).toBe(true);
  });

  it('stays silent once a listener claims the event with preventDefault', () => {
    // The other half of the contract: this is what lets the app's real policy
    // swallow the failures it has already reported to the user.
    withClaimingListener(() => {
      expect(anyHandlerThrows(new MissingDataKeyError())).toBe(false);
    });
  });

  it('dispatches a cancelable event carrying the reason', () => {
    // `preventDefault()` is a no-op on a non-cancelable event, so if the bridge
    // ever dropped `{ cancelable: true }` the claim above could never be
    // honoured and every claimed rejection would start failing runs.
    const seen: Array<{ reason: unknown; cancelable: boolean }> = [];
    const spy = (event: Event) => {
      seen.push({ reason: (event as Event & { reason: unknown }).reason, cancelable: event.cancelable });
      event.preventDefault();
    };
    window.addEventListener('unhandledrejection', spy);
    try {
      const reason = new MissingDataKeyError();
      anyHandlerThrows(reason);
      expect(seen).toContainEqual({ reason, cancelable: true });
    } finally {
      window.removeEventListener('unhandledrejection', spy);
    }
  });
});
