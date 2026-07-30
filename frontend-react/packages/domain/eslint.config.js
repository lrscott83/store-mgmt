import globals from 'globals';
import { config as baseConfig } from '@store-mgmt/eslint-config/base';

export default [
  ...baseConfig,
  {
    // Pure TypeScript, no DOM: this package is the shared domain model and runs
    // under node (and inside whatever bundles it). The react-router config is
    // deliberately not used here — it would declare browser globals this
    // package has no business reaching for.
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Type-aware linting errors on any file the TypeScript project does not
    // own, and `tsconfig.json` only includes `src`. These two live at the
    // package root by necessity, so lint them without type information.
    files: ['eslint.config.js', 'vitest.config.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null,
      },
    },
  },
];
