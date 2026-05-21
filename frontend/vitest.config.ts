import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['node_modules/', 'src/**/*.module.ts', 'src/**/*.scss', 'src/environments/**', 'src/test.ts', 'src/main.ts', '**/*.spec.ts']
    },
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@env': resolve(__dirname, 'src/environments'),
      'src/app': resolve(__dirname, 'src/app')
    }
  },
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@env': resolve(__dirname, 'src/environments'),
      'src/app': resolve(__dirname, 'src/app')
    }
  }
});
