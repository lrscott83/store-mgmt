// @ts-check
import globals from 'globals';
import { config as baseConfig } from './base.config.js';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'turbo/no-undeclared-env-vars': ['error', { allowList: ['DEV'] }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error'
    }
  },
  { ignores: ['eslint.config.mjs', 'build/**', '.react-router/**'] }
];
