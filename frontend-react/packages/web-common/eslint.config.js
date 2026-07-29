import reactRouterConfig from '@store-mgmt/eslint-config/react-router';

export default [
  ...reactRouterConfig,
  {
    ignores: ['dist/**'],
  },
  {
    // Same carve-out as `apps/web-store-pos`: the shared config enables
    // type-aware linting, which errors on any file the TypeScript project does
    // not own. This config file and the vitest configs are not part of it.
    files: ['eslint.config.js', 'vitest.config.ts', 'vitest.setup.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null,
      },
    },
  },
];
