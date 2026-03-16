import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    teardownTimeout: 30000,
    testTimeout: 30000,
    include: [
      'apps/desktop/renderer/src/**/*.test.{ts,tsx}',
      'packages/shared/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      thresholds: {
        // Global thresholds only; per-file thresholds removed to avoid
        // hardcoded paths that break when files move or are renamed.
        lines: 30,
        branches: 30,
        functions: 30,
        statements: 30,
      },
      include: [
        'apps/desktop/renderer/src/**/*.{ts,tsx}',
      ],
      exclude: [
        'apps/desktop/renderer/src/**/*.test.{ts,tsx}',
        'apps/desktop/renderer/src/**/*.d.ts',
        'apps/desktop/renderer/src/main.tsx',
        'apps/desktop/renderer/src/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, 'apps/desktop/renderer/src') + '/',
      '@dios/shared/firebase': path.resolve(__dirname, 'tests/mocks/firebase.ts'),
      '@dios/shared': path.resolve(__dirname, 'packages/shared/src'),
    },
  },
})
