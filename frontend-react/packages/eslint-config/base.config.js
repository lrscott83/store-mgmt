import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import compatPlugin from "eslint-plugin-compat";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import { BANNED_APIS, BROWSER_FLOOR, POLYFILLED_APIS } from "./browser-compat.js";

/**
 * The restricted syntax list is generated from the single-source policy in
 * `browser-compat.js`, never hand-written here: a duplicated list drifts from
 * the policy silently. `severity` is always `error` because every lint script
 * in this monorepo runs with `--max-warnings=0` (see below).
 */
const bannedApiRestrictions = BANNED_APIS.map(({ api, alternative, selector }) => ({
  selector,
  message: `${api} is not available in Chrome ${BROWSER_FLOOR.chrome} (the project browser floor) and is not polyfilled. Use ${alternative}.`,
}));

/**
 * Polyfill names for `eslint-plugin-compat`, derived from the single-source
 * policy — never a hand-written copy. The plugin matches a polyfill against its
 * own metadata id, and the records spell the same API differently: the ES (MDN)
 * records use the `Array.prototype.at` form, a call site can only ever produce
 * `Array.at`, and caniuse names a static API after the constructor (`Crypto`)
 * while the global that owns it is lowercase (`crypto`). Emitting every
 * spelling derived from the one `api` string keeps a single source of truth
 * while silencing neither provider. A bare `Array` entry is deliberately never
 * emitted: `isPolyfilled` also matches `protoChain[0]`, so it would excuse every
 * Array member at once.
 */
const polyfilledApis = [
  ...new Set(
    POLYFILLED_APIS.flatMap(({ api }) => {
      const withoutPrototype = api.replace(".prototype", "");
      return [api, withoutPrototype].flatMap((name) => [
        name,
        `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      ]);
    }),
  ),
];

/**
 * `flat/recommended` also injects `globals.browser`. Those globals are dropped
 * here on purpose: `react-router.config.js` already declares every global the
 * browser consumers need, and `packages/domain` declares node globals only
 * "because the react-router config would declare browser globals this package
 * has no business reaching for". The compat rule inspects the AST, never the
 * global scope, so it does not need them — the rule, the plugin and the
 * settings are kept, only the redundant globals are not.
 */
const { languageOptions: _compatBrowserGlobals, ...compatRecommended } =
  compatPlugin.configs["flat/recommended"];

/** @type {import("eslint").Linter.Config[]} */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      // Every lint script in this monorepo runs with `--max-warnings=0`, which
      // makes "warn" and "error" fail identically. A severity that does not
      // describe what happens is worse than no severity: it reads as "we are
      // adopting this gradually" when the truth is "this breaks the build".
      // So nothing here is a warning. If a rule should not fail the build, the
      // honest move is to turn it off, not to whisper it.
      "turbo/no-undeclared-env-vars": "error",
      // A leading underscore is how this codebase declares "this binding exists
      // to satisfy a signature or a destructuring shape, and is deliberately
      // not read" — mock implementations that must match a real method's arity,
      // and Angular-parity method parameters that the ported body ignores.
      // Honour that convention instead of reporting it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Mechanical completeness check against the real caniuse/MDN databases for
    // the target declared once in `frontend-react/package.json`
    // (`"browserslist": ["chrome 89"]`). The hand-written `BANNED_APIS` rule
    // above can only catch what someone remembered to list; this one catches
    // whatever the database says the floor does not have.
    //
    // `lintAllEsApis` is mandatory rather than cosmetic: without it the plugin
    // only knows Web APIs, and the API that actually crashed the device
    // (`Array.prototype.at`) is an ES API.
    //
    // Scoping mirrors the banned-API rule: this is a browser-floor concern, so
    // it only guards code that ships to the device. Tests, benches, E2E
    // fixtures, build scripts and the separately-compiled service worker run
    // outside the device runtime or outside the browser realm entirely.
    ...compatRecommended,
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ignores: [
      "**/__tests__/**",
      "**/*.test.*",
      "**/*.spec.*",
      "**/*.bench.*",
      "e2e/**",
      "scripts/**",
      "**/*.mjs",
      "**/app/service-worker.ts",
    ],
    settings: {
      lintAllEsApis: true,
      polyfills: polyfilledApis,
    },
  },
  {
    ignores: ["dist/**"],
  },
  {
    // Banned APIs are a browser-floor concern, so the rule only guards code
    // that ships to the device. Tests, benches, E2E fixtures and build scripts
    // run on developer machines where the API exists, and a test may
    // legitimately use it to prove the replacement is equivalent.
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    ignores: [
      "**/*.test.*",
      "**/*.spec.*",
      "**/__tests__/**",
      "**/*.bench.*",
      "e2e/**",
      "scripts/**",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...bannedApiRestrictions],
    },
  },
];
