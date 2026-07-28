import { describe, it, expect } from 'vitest';
import { resolveStrategy, type FetchStrategy, type StrategyInput } from '../sw-strategy';

// ── resolveStrategy — pwa-offline-shell spec ─────────────────────────────────
// Pure routing decision (no `caches`, no `self`), so this is fully covered by
// Vitest with no service-worker environment (design.md D5). Order matters:
// non-GET → cross-origin → /api → navigate → cache-first.

const SELF_ORIGIN = 'https://app.example.com';

function url(pathname: string, origin = SELF_ORIGIN): URL {
  return new URL(pathname, origin);
}

interface Case {
  readonly name: string;
  readonly input: StrategyInput;
  readonly expected: FetchStrategy;
}

const cases: Case[] = [
  {
    name: 'same-origin navigation request → shell',
    input: { url: url('/sales/new'), method: 'GET', mode: 'navigate', selfOrigin: SELF_ORIGIN },
    expected: 'shell',
  },
  {
    name: 'root navigation request → shell',
    input: { url: url('/'), method: 'GET', mode: 'navigate', selfOrigin: SELF_ORIGIN },
    expected: 'shell',
  },
  {
    name: 'exact /api path → passthrough',
    input: { url: url('/api'), method: 'GET', mode: 'no-cors', selfOrigin: SELF_ORIGIN },
    expected: 'passthrough',
  },
  {
    name: '/api/products path → passthrough',
    input: { url: url('/api/products'), method: 'GET', mode: 'cors', selfOrigin: SELF_ORIGIN },
    expected: 'passthrough',
  },
  {
    name: '/apiary/report.js is NOT falsely excluded as an API path → cache-first',
    input: { url: url('/apiary/report.js'), method: 'GET', mode: 'no-cors', selfOrigin: SELF_ORIGIN },
    expected: 'cache-first',
  },
  {
    name: 'non-GET request → passthrough',
    input: { url: url('/sales/new'), method: 'POST', mode: 'navigate', selfOrigin: SELF_ORIGIN },
    expected: 'passthrough',
  },
  {
    name: 'non-GET request to a static-looking path → passthrough',
    input: { url: url('/assets/app.js'), method: 'PUT', mode: 'cors', selfOrigin: SELF_ORIGIN },
    expected: 'passthrough',
  },
  {
    name: 'cross-origin request → passthrough',
    input: {
      url: url('/whatever.js', 'https://cdn.other-origin.com'),
      method: 'GET',
      mode: 'cors',
      selfOrigin: SELF_ORIGIN,
    },
    expected: 'passthrough',
  },
  {
    name: 'same-origin JS asset → cache-first',
    input: { url: url('/assets/app-abc123.js'), method: 'GET', mode: 'cors', selfOrigin: SELF_ORIGIN },
    expected: 'cache-first',
  },
  {
    name: 'same-origin CSS asset → cache-first',
    input: { url: url('/assets/app-abc123.css'), method: 'GET', mode: 'cors', selfOrigin: SELF_ORIGIN },
    expected: 'cache-first',
  },
  {
    name: 'same-origin font asset → cache-first',
    input: { url: url('/fonts/inter/inter-400.woff2'), method: 'GET', mode: 'cors', selfOrigin: SELF_ORIGIN },
    expected: 'cache-first',
  },
  {
    name: 'same-origin icon asset → cache-first',
    input: { url: url('/icons/icon-192.png'), method: 'GET', mode: 'no-cors', selfOrigin: SELF_ORIGIN },
    expected: 'cache-first',
  },
];

describe('resolveStrategy', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, testCase) => {
    expect(resolveStrategy(testCase.input)).toBe(testCase.expected);
  });
});
