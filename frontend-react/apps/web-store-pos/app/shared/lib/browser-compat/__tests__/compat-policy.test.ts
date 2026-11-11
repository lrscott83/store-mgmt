import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { Linter } from 'eslint';
import {
  POLYFILLED_APIS,
  BANNED_APIS,
  BROWSER_FLOOR,
} from '@store-mgmt/eslint-config/browser-compat';
import type { PolyfillInstallResult } from '../polyfills';

/**
 * Contract tests for the browser-floor policy that drives the lint guard.
 *
 * The policy is the single source of truth for both the generated
 * `no-restricted-syntax` rule and the startup polyfills. If a name here is not
 * really installable, the lint guard would bless an API the device never gets.
 */

interface ApiTarget {
  target: object;
  name: string;
  /**
   * Where the native implementation may also live further up the chain.
   * `crypto.randomUUID` is a prototype method on the `crypto` instance in
   * jsdom, so removing the own property is not enough to make it absent.
   */
  inheritedFrom?: object;
}

const CRYPTO_API = 'crypto.randomUUID';

const cryptoGlobal = globalThis.crypto as Crypto | undefined;
const hasWebCrypto = typeof cryptoGlobal === 'object' && cryptoGlobal !== null;

/** Each policy API name mapped to the object/property that owns it. */
const API_TARGETS: Record<string, ApiTarget> = {
  'Array.prototype.at': { target: Array.prototype, name: 'at' },
  'String.prototype.at': { target: String.prototype, name: 'at' },
  'Array.prototype.findLast': { target: Array.prototype, name: 'findLast' },
  'Array.prototype.findLastIndex': { target: Array.prototype, name: 'findLastIndex' },
  'Array.prototype.toSorted': { target: Array.prototype, name: 'toSorted' },
  'Array.prototype.toReversed': { target: Array.prototype, name: 'toReversed' },
  'Array.prototype.toSpliced': { target: Array.prototype, name: 'toSpliced' },
  'Object.hasOwn': { target: Object, name: 'hasOwn' },
  [CRYPTO_API]: {
    target: (hasWebCrypto ? cryptoGlobal : {}) as object,
    name: 'randomUUID',
    inheritedFrom: hasWebCrypto ? (Object.getPrototypeOf(cryptoGlobal) as object) : undefined,
  },
};

function asRecord(target: object): Record<string, unknown> {
  return target as Record<string, unknown>;
}

function requireTarget(api: string): ApiTarget {
  const entry = API_TARGETS[api];
  if (!entry) throw new Error(`Untracked API in test table: ${api}`);
  return entry;
}

/**
 * Reads only the owner's own property: a lower prototype implementation must
 * not mask the fact that an installer did not define anything.
 */
function readApi(api: string): unknown {
  const entry = requireTarget(api);
  return Object.getOwnPropertyDescriptor(entry.target, entry.name)?.value;
}

/** Deletes an API from its owner(s) and proves it is really gone. */
function dropApi(api: string): void {
  const entry = requireTarget(api);
  delete asRecord(entry.target)[entry.name];
  if (entry.inheritedFrom) delete asRecord(entry.inheritedFrom)[entry.name];
  expect(readApi(api)).toBeUndefined();
}

interface CapturedDescriptors {
  own: PropertyDescriptor | undefined;
  inherited: PropertyDescriptor | undefined;
}

/**
 * Captured while the originals are still in place: this module's top-level
 * code runs before `beforeAll` dynamically imports the polyfills module, and
 * before any test drops an intrinsic.
 */
const ORIGINAL_DESCRIPTORS = new Map<string, CapturedDescriptors>();
for (const [api, entry] of Object.entries(API_TARGETS)) {
  ORIGINAL_DESCRIPTORS.set(api, {
    own: Object.getOwnPropertyDescriptor(entry.target, entry.name),
    inherited: entry.inheritedFrom
      ? Object.getOwnPropertyDescriptor(entry.inheritedFrom, entry.name)
      : undefined,
  });
}

/**
 * Puts back the descriptors a test touched. Called from a `finally` inside
 * every test so a throwing assertion cannot leak a replaced or deleted
 * intrinsic into a later suite that happens to share this realm.
 */
function restoreApis(apis: readonly string[]): void {
  for (const api of apis) {
    const entry = requireTarget(api);
    const original = ORIGINAL_DESCRIPTORS.get(api);
    delete asRecord(entry.target)[entry.name];
    if (original?.own) Object.defineProperty(entry.target, entry.name, original.own);
    if (entry.inheritedFrom) {
      delete asRecord(entry.inheritedFrom)[entry.name];
      if (original?.inherited) {
        Object.defineProperty(entry.inheritedFrom, entry.name, original.inherited);
      }
    }
  }
}

/** Proves a test really put the intrinsics it touched back the way it found them. */
function expectOriginalDescriptors(apis: readonly string[]): void {
  for (const api of apis) {
    const entry = requireTarget(api);
    const original = ORIGINAL_DESCRIPTORS.get(api);
    expect(
      Object.getOwnPropertyDescriptor(entry.target, entry.name),
      `${api} is back to its original own descriptor`,
    ).toEqual(original?.own);
    if (entry.inheritedFrom) {
      expect(
        Object.getOwnPropertyDescriptor(entry.inheritedFrom, entry.name),
        `${api} is back to its original inherited descriptor`,
      ).toEqual(original?.inherited);
    }
  }
}

const ALL_POLYFILLED = POLYFILLED_APIS.map((entry) => entry.api);
const TOUCHED = [...new Set([...ALL_POLYFILLED, CRYPTO_API])];

let installBrowserPolyfills: () => PolyfillInstallResult = () => {
  throw new Error('polyfills module was not loaded before use');
};

beforeAll(async () => {
  const module = await import('../polyfills');
  installBrowserPolyfills = module.installBrowserPolyfills;
});

/**
 * Safety net only. Each test restores in its own `finally`; this runs after
 * the test body and keeps a stray failure from reaching the next suite.
 */
afterEach(() => {
  restoreApis(TOUCHED);
});

describe('browser compatibility policy', () => {
  it('declares both a non-empty polyfilled and a non-empty banned list', () => {
    expect(POLYFILLED_APIS.length).toBeGreaterThan(0);
    expect(BANNED_APIS.length).toBeGreaterThan(0);
  });

  it('keeps the polyfilled and banned lists disjoint by API name', () => {
    const polyfilled = new Set(POLYFILLED_APIS.map((entry) => entry.api));
    const banned = new Set(BANNED_APIS.map((entry) => entry.api));

    const overlap = [...polyfilled].filter((api) => banned.has(api));
    expect(overlap, 'an API cannot be both polyfilled and banned').toEqual([]);
  });

  it('gives every banned entry a non-empty alternative and selector', () => {
    for (const entry of BANNED_APIS) {
      expect(entry.alternative.trim(), `${entry.api} alternative is non-empty`).not.toBe('');
      expect(entry.selector.trim(), `${entry.api} selector is non-empty`).not.toBe('');
    }
  });

  it('resolves every polyfilled API to a tracked owner in this test', () => {
    for (const entry of POLYFILLED_APIS) {
      expect(API_TARGETS[entry.api], `${entry.api} has a tracked owner`).toBeDefined();
    }
  });

  /**
   * Every name in the policy must name an API this project really makes
   * available. Drop it from its owner, run the real installer, and prove the
   * capability is back. A host without Web Crypto cannot install the crypto
   * polyfill, so that one entry is skipped there rather than faked.
   */
  it('makes every polyfilled API callable again after it is removed', () => {
    for (const entry of POLYFILLED_APIS) {
      const api = entry.api;
      if (api === CRYPTO_API && !hasWebCrypto) continue;

      const touched = [api];
      try {
        dropApi(api);

        const result = installBrowserPolyfills();

        expect(
          [...result.installed, ...result.alreadyPresent],
          `${api} is reported available by the installer`,
        ).toContain(api);
        expect(typeof readApi(api), `${api} is callable after installation`).toBe('function');
      } finally {
        restoreApis(touched);
      }
      expectOriginalDescriptors(touched);
    }
  });
});

/**
 * The policy above only proves the *data* is well formed. Nothing so far proves
 * the generated lint rule exists, or that each `selector` it carries really
 * matches the call it claims to ban: a typo in a selector silently unenforces
 * that ban and every other test stays green. These tests load the real config
 * that `pnpm lint` consumes and run ESLint's own `Linter` over the *whole*
 * exported config array — the same array the CLI feeds ESLint — for a fixture
 * per banned API.
 */

const BASE_CONFIG_SPECIFIER: string = '@store-mgmt/eslint-config/base';
const RESTRICTED_SYNTAX = 'no-restricted-syntax';

/**
 * A path shaped like real application source, not a bare `fixture.js` at the
 * config root. The guard is scoped by `files` and `ignores`, so linting a file
 * outside `app/` would prove the selector strings while leaving the question
 * "is this rule reachable at all for a file that actually ships?" unanswered.
 */
const FIXTURE_FILENAME = 'app/sales/example.js';

/**
 * `@store-mgmt/eslint-config` ships plain ESM and this workspace does not
 * enable `allowJs`. The `./browser-compat` subpath has an ambient declaration
 * file, but `./base` has none, so a literal specifier would fail typecheck with
 * `TS7016` for a module that resolves perfectly at runtime. Widening the
 * specifier to `string` makes TypeScript treat the import as `any` while the
 * runtime still resolves the real package, and the cast restores the
 * `Linter.Config[]` shape the package documents in its own JSDoc.
 */
async function loadBaseConfig(): Promise<readonly Linter.Config[]> {
  const baseModule: unknown = await import(BASE_CONFIG_SPECIFIER);
  const { config } = baseModule as { config: Linter.Config[] };
  expect(Array.isArray(config), 'base config exports a flat config array').toBe(true);
  return config;
}

interface RestrictedSyntaxEntry {
  readonly selector: string;
  readonly message: string;
}

function isRestrictedSyntaxEntry(value: unknown): value is RestrictedSyntaxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { selector?: unknown; message?: unknown };
  return typeof candidate.selector === 'string' && typeof candidate.message === 'string';
}

/**
 * Reads the raw `no-restricted-syntax` value the way ESLint stores it. Returns
 * `undefined` when the generated rule is absent so a test can fail loudly
 * instead of silently linting with no guard at all.
 */
function readRestrictedSyntaxRule(configs: readonly Linter.Config[]): unknown {
  const owners = configs.filter(
    (candidate) => candidate.rules?.[RESTRICTED_SYNTAX] !== undefined,
  );
  expect(
    owners,
    `the generated base config must carry exactly one \`${RESTRICTED_SYNTAX}\` rule`,
  ).toHaveLength(1);
  return owners[0]?.rules?.[RESTRICTED_SYNTAX];
}

function readSeverity(rule: unknown): unknown {
  return Array.isArray(rule) ? rule[0] : rule;
}

function readRestrictions(rule: unknown): RestrictedSyntaxEntry[] {
  const parts: readonly unknown[] = Array.isArray(rule) ? rule : [];
  return parts.slice(1).map((part) => {
    if (!isRestrictedSyntaxEntry(part)) {
      throw new Error(
        `${RESTRICTED_SYNTAX} carries an entry that is not a { selector, message } object: ${JSON.stringify(part)}`,
      );
    }
    return part;
  });
}

/**
 * Lints `source` through the entire exported config array, exactly the way
 * `pnpm lint` does, and returns every diagnostic unfiltered.
 */
function lint(source: string, configs: readonly Linter.Config[]): Linter.LintMessage[] {
  // `configType` is pinned explicitly: without it these tests inherit whatever
  // default the installed ESLint major happens to have, so an upgrade could
  // change what is being proven without touching this file.
  const linter = new Linter({ configType: 'flat' });
  // `verify` types its config parameter as a mutable array; the loaded array is
  // only read here, so a shallow copy keeps the `readonly` contract intact.
  return linter.verify(source, [...configs], { filename: FIXTURE_FILENAME });
}

/**
 * Loading the real config pulls ESLint, `eslint-plugin-compat` and the
 * browserslist databases into a worker for the first time. On this suite (462
 * files, jsdom, `vitest.config.ts` already documents a busy workstation) that
 * cold import has been observed to blow the global 15 s `hookTimeout`, which
 * skips every case below and reports a failure that has nothing to do with the
 * guard. The budget is raised for this file only; it does not relax any
 * assertion and a genuine hang still fails, just later.
 */
const CONFIG_LOAD_TIMEOUT_MS = 60_000;

describe('generated browser-floor lint guard', () => {
  let configs: readonly Linter.Config[];

  beforeAll(async () => {
    configs = await loadBaseConfig();
    // Fails loudly, before a single fixture is linted, if the generated guard
    // is absent or duplicated: silence here would make every case below pass
    // for the wrong reason.
    readRestrictedSyntaxRule(configs);
  }, CONFIG_LOAD_TIMEOUT_MS);

  it('generates one restriction per banned API instead of degenerating', () => {
    const rule = readRestrictedSyntaxRule(configs);

    expect(readSeverity(rule), 'the guard fails the build, so it is an error').toBe('error');

    const restrictions = readRestrictions(rule);
    expect(
      restrictions,
      'one restriction per banned API: a short list means a ban was dropped',
    ).toHaveLength(BANNED_APIS.length);

    const selectors = new Set(restrictions.map((restriction) => restriction.selector));
    for (const entry of BANNED_APIS) {
      expect(selectors, `${entry.api} keeps its policy selector`).toContain(entry.selector);
    }
  });

  /**
   * Driven from `BANNED_APIS`, so an entry added to the policy is covered here
   * without editing this test. Every banned name is callable as `name(0)`, and
   * the argument's arity is irrelevant to a syntax selector.
   */
  describe.each(BANNED_APIS.map((entry) => ({ entry })))('$entry.api', ({ entry }) => {
    it(`reports a call to ${entry.api} with the policy message`, () => {
      const messages = lint(`${entry.api}(0);`, configs);

      // The full array also runs the other rules that `pnpm lint` runs, and a
      // fixture is a bare expression statement in a file with no declared
      // browser globals: `no-undef` fires on the global name, and
      // `compat/compat` fires for the APIs its database knows (`structuredClone`
      // among them). Neither is the guard under test here, so the assertion is
      // scoped to `no-restricted-syntax` — filtered, not trimmed: an unexpected
      // extra copy of *this* rule would still fail the exact-one count below.
      const restricted = messages.filter((message) => message.ruleId === RESTRICTED_SYNTAX);

      expect(
        restricted,
        `${entry.api}(0) must produce exactly one ${RESTRICTED_SYNTAX} diagnostic`,
      ).toHaveLength(1);
      const [message] = restricted;
      expect(message?.ruleId).toBe(RESTRICTED_SYNTAX);
      expect(message?.message).toContain(entry.api);
      expect(message?.message).toContain(`Chrome ${BROWSER_FLOOR.chrome}`);
      expect(message?.message).toContain(entry.alternative);
    });
  });

  it('leaves a harmless call alone', () => {
    const messages = lint('Math.max(1, 2);', configs);

    expect(
      messages,
      'Math.max is available in Chrome 89 and is not restricted, so the whole config array stays quiet',
    ).toEqual([]);
  });
});
