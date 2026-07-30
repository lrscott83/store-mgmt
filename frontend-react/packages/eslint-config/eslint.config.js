import globals from 'globals';
import { config as baseConfig } from './base.config.js';

// The config package linting itself with its own base config. Type-aware rules
// are not enabled here: these are plain `.js` modules with no TypeScript
// project behind them, which is also why the base config — not the
// react-router one — is the right starting point.
export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
];
