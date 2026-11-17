import type { Page } from '@playwright/test';

/**
 * Browser-side evidence for a failing test.
 *
 * A failure whose only artifact is an accessibility snapshot is a failure
 * nobody can diagnose: React Router's generic error screen renders identically
 * whatever threw underneath it. This collector keeps the console errors,
 * uncaught page errors and failed requests that produced that screen, so they
 * reach the test report instead of dying with the page.
 *
 * Same principle as the two network observers in this folder — a safeguard
 * that can be forgotten is not a safeguard — which is why `test.ts` installs
 * it as another `{ auto: true }` fixture.
 */

/** At most this many entries are retained; the oldest are dropped first. */
const MAX_ENTRIES = 200;

/** Terminal summary bounds — a failure scroll must stay readable. */
const MAX_SUMMARY_LINES = 40;
const MAX_SUMMARY_CHARS = 2000;

const SUMMARY_PREFIX =
  '[failure-diagnostics] browser-side evidence captured during this test:\n';

/** Frames of a page-error stack worth surfacing: where it threw, not the whole tail. */
const MAX_STACK_FRAMES = 3;

const ATTACHMENT_NAME = 'failure-diagnostics';

export interface FailureDiagnostics {
  /** Entries collected so far, oldest first. Plain strings only. */
  entries(): string[];
  /** Drops every collected entry. */
  clear(): void;
}

function push(list: string[], entry: string): void {
  list.push(entry);
  if (list.length > MAX_ENTRIES) {
    list.splice(0, list.length - MAX_ENTRIES);
  }
}

function formatPageError(error: Error): string {
  const name = error?.name ?? 'Error';
  const message = error?.message ?? String(error);
  const frames = (error?.stack ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_STACK_FRAMES);
  if (frames.length === 0) return `[pageerror] ${name}: ${message}`;
  return `[pageerror] ${name}: ${message}\n  ${frames.join('\n  ')}`;
}

export function installFailureDiagnostics(page: Page): FailureDiagnostics {
  const entries: string[] = [];

  // Every listener swallows its own errors (S5): a broken collector must never
  // fail, delay, or otherwise disturb the test it is watching.
  page.on('console', (message) => {
    try {
      if (message.type() !== 'error') return;
      const location = message.location();
      push(
        entries,
        `[console.error] ${message.text()} (${location.url}:${location.lineNumber})`,
      );
    } catch {
      // Ignored on purpose: diagnostics never break the test.
    }
  });

  page.on('pageerror', (error) => {
    try {
      push(entries, formatPageError(error));
    } catch {
      // Ignored on purpose: diagnostics never break the test.
    }
  });

  page.on('requestfailed', (request) => {
    try {
      const errorText = request.failure()?.errorText ?? 'unknown network error';
      push(entries, `[requestfailed] ${request.method()} ${request.url()} -> ${errorText}`);
    } catch {
      // Ignored on purpose: diagnostics never break the test.
    }
  });

  return {
    entries: () => [...entries],
    clear: () => {
      entries.length = 0;
    },
  };
}

/**
 * Bounded, terminal-safe rendering of a collected buffer. Returns an empty
 * string for an empty buffer so callers can skip printing entirely.
 */
export function formatFailureDiagnosticsSummary(entries: readonly string[]): string {
  if (entries.length === 0) return '';
  const text = entries.join('\n');
  const tail = text.split('\n').slice(-MAX_SUMMARY_LINES).join('\n');
  const budget = MAX_SUMMARY_CHARS - SUMMARY_PREFIX.length;
  return SUMMARY_PREFIX + (tail.length > budget ? tail.slice(-budget) : tail);
}

export { ATTACHMENT_NAME };
