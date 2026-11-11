/**
 * Single source of truth for the project browser floor policy.
 *
 * Observed production device: Chrome/89.0.4389.116 (Android 9, Redmi 7A,
 * MIUI Browser). `build.target` lowers JS syntax only; it never polyfills
 * APIs, so any API added after Chrome 89 must be either polyfilled by
 * `apps/web-store-pos/app/shared/lib/browser-compat/polyfills.ts` or banned
 * by lint. Keeping both lists here prevents a consumer from duplicating them.
 */

export const BROWSER_FLOOR = { chrome: 89 };

/** APIs above the floor that the project installs at startup, so code may use them. */
export const POLYFILLED_APIS = [
  { api: 'Array.prototype.at', chromeVersion: 92 },
  { api: 'String.prototype.at', chromeVersion: 92 },
  { api: 'Array.prototype.findLast', chromeVersion: 97 },
  { api: 'Array.prototype.findLastIndex', chromeVersion: 97 },
  { api: 'Array.prototype.toSorted', chromeVersion: 110 },
  { api: 'Array.prototype.toReversed', chromeVersion: 110 },
  { api: 'Array.prototype.toSpliced', chromeVersion: 110 },
  { api: 'Object.hasOwn', chromeVersion: 93 },
  { api: 'crypto.randomUUID', chromeVersion: 92 },
];

/** APIs above the floor that the project does NOT polyfill, so code must not use them. */
export const BANNED_APIS = [
  {
    api: 'structuredClone',
    chromeVersion: 98,
    alternative: "deepClone from '~/shared/lib/browser-compat/deep-clone'",
    selector: 'CallExpression[callee.name="structuredClone"]',
  },
  {
    api: 'AbortSignal.timeout',
    chromeVersion: 103,
    alternative: "an AbortController aborted by a setTimeout you clear yourself",
    selector: 'CallExpression[callee.object.name="AbortSignal"][callee.property.name="timeout"]',
  },
  {
    api: 'AbortSignal.any',
    chromeVersion: 116,
    alternative:
      "a parent AbortController that aborts when each signal fires its 'abort' event",
    selector: 'CallExpression[callee.object.name="AbortSignal"][callee.property.name="any"]',
  },
  {
    api: 'URL.canParse',
    chromeVersion: 120,
    alternative: 'a `new URL(value)` call wrapped in try/catch',
    selector: 'CallExpression[callee.object.name="URL"][callee.property.name="canParse"]',
  },
  {
    api: 'Object.groupBy',
    chromeVersion: 117,
    alternative: 'a reduce into a plain object keyed by the grouping value',
    selector: 'CallExpression[callee.object.name="Object"][callee.property.name="groupBy"]',
  },
  {
    api: 'Array.fromAsync',
    chromeVersion: 121,
    alternative: 'a `for await` loop that pushes each value into an array',
    selector: 'CallExpression[callee.object.name="Array"][callee.property.name="fromAsync"]',
  },
];
