import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolyfillInstallResult } from '../polyfills';

interface StartupReport {
  result: PolyfillInstallResult | null;
  error: string | null;
}

/**
 * The report is captured at module scope by `polyfills.ts`, so a test cannot
 * produce a degraded one without mutating intrinsics before the module
 * evaluates. The flush only reads it, so it is mocked instead.
 */
const startup = vi.hoisted(() => ({
  report: null as StartupReport | null,
}));

vi.mock('../polyfills', () => ({
  readStartupPolyfillReport: () => startup.report,
}));

import {
  flushStartupPolyfillDiagnostics,
  type StartupDiagnosticEntry,
} from '../startup-diagnostics';

interface CapturedLog {
  readonly calls: StartupDiagnosticEntry[];
  readonly log: (entry: StartupDiagnosticEntry) => void;
}

function captureLog(): CapturedLog {
  const calls: StartupDiagnosticEntry[] = [];
  return { calls, log: (entry) => calls.push(entry) };
}

beforeEach(() => {
  startup.report = {
    result: { installed: [], alreadyPresent: ['Array.prototype.at'], failed: [] },
    error: null,
  };
});

describe('flushStartupPolyfillDiagnostics', () => {
  it('logs nothing when the startup report is clean', () => {
    const { calls, log } = captureLog();

    flushStartupPolyfillDiagnostics(log);

    expect(calls).toEqual([]);
  });

  it('logs one warning carrying every failed API and its reason', () => {
    startup.report = {
      result: {
        installed: [],
        alreadyPresent: ['String.prototype.at'],
        failed: [
          { api: 'Array.prototype.at', reason: 'Cannot redefine property: at' },
          { api: 'Object.hasOwn', reason: 'Intrinsics are frozen' },
        ],
      },
      error: null,
    };
    const { calls, log } = captureLog();

    flushStartupPolyfillDiagnostics(log);

    expect(calls).toHaveLength(1);
    const [entry] = calls;
    expect(entry.level).toBe('warn');
    expect(entry.message).toContain('[browser-compat]');
    expect(entry.message).toContain('polyfills degraded at startup');
    expect(entry.context).toEqual({
      'Array.prototype.at': 'Cannot redefine property: at',
      'Object.hasOwn': 'Intrinsics are frozen',
    });
    expect(entry.context).not.toHaveProperty('startupError');
  });

  it('logs the startup error when the whole installation threw', () => {
    startup.report = { result: null, error: 'Object.defineProperty is not a function' };
    const { calls, log } = captureLog();

    flushStartupPolyfillDiagnostics(log);

    expect(calls).toHaveLength(1);
    expect(calls[0].level).toBe('warn');
    expect(calls[0].context).toEqual({
      startupError: 'Object.defineProperty is not a function',
    });
  });

  it('never propagates when the log implementation throws', () => {
    startup.report = {
      result: {
        installed: [],
        alreadyPresent: [],
        failed: [{ api: 'Array.prototype.at', reason: 'boom' }],
      },
      error: null,
    };

    expect(() =>
      flushStartupPolyfillDiagnostics(() => {
        throw new Error('the log sink broke');
      }),
    ).not.toThrow();
  });
});
