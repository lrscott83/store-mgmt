import reactRouterConfig from '@store-mgmt/eslint-config/react-router';

export default [
  ...reactRouterConfig,
  {
    ignores: ['dist/**'],
  },
  {
    // Same carve-out as `apps/web-store-pos`: the shared config enables
    // type-aware linting, which errors on any file the TypeScript project does
    // not own. Only this file qualifies now — the vitest config and setup were
    // pulled into `tsconfig.json`, so they are type-aware linted like the rest.
    files: ['eslint.config.js'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null,
      },
    },
  },
];
