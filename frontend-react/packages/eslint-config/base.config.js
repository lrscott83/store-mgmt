import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import { BANNED_APIS, BROWSER_FLOOR } from "./browser-compat.js";

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
