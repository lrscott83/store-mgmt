import globals from 'globals';
import reactRouterConfig from '@store-mgmt/eslint-config/react-router';

export default [
  ...reactRouterConfig,
  {
    ignores: ['build/**', '.react-router/**', 'public/**'],
  },
  {
    // The shared config turns on type-aware linting (`projectService: true`),
    // which fails outright on any file the TypeScript project does not own.
    // Three groups of files legitimately sit outside it: the build scripts
    // (plain `.mjs`, run by node, never compiled), this config file itself,
    // and `app/service-worker.ts` — deliberately excluded from `tsconfig.json`
    // because it is compiled separately by `scripts/build-sw.mjs`. Lint them
    // without type information rather than dragging them into the TS project.
    files: ['**/*.mjs', 'eslint.config.js', 'app/service-worker.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null,
      },
    },
  },
  {
    // The build scripts run under node, not the browser: the shared config only
    // declares browser and service-worker globals, so `process` reads as undefined.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
