import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

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
];
