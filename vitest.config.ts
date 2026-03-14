import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    teardownTimeout: 5000,
    include: [
      'apps/desktop/renderer/src/**/*.test.{ts,tsx}',
      'packages/shared/src/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      thresholds: {
        'apps/desktop/renderer/src/utils/invoiceCalculator.ts': {
          lines: 100, branches: 100, functions: 100, statements: 100,
        },
        'apps/desktop/renderer/src/utils/templateRenderer.ts': {
          lines: 100, branches: 100, functions: 100, statements: 100,
        },
        'apps/desktop/renderer/src/utils/distanceUtils.ts': {
          lines: 35, branches: 35, functions: 60, statements: 35,
        },
        'apps/desktop/renderer/src/lib/pdfGenerator.ts': {
          lines: 95, branches: 55, functions: 100, statements: 95,
        },
      },
      include: [
        'apps/desktop/renderer/src/utils/invoiceCalculator.ts',
        'apps/desktop/renderer/src/utils/templateRenderer.ts',
        'apps/desktop/renderer/src/utils/distanceUtils.ts',
        'apps/desktop/renderer/src/lib/pdfGenerator.ts',
        'apps/desktop/renderer/src/components/InspectionProgressBar.tsx',
        'apps/desktop/renderer/src/components/StepModal.tsx',
        'apps/desktop/renderer/src/components/ChecklistEditor.tsx',
        'apps/desktop/renderer/src/components/RateConfigSection.tsx',
        'apps/desktop/renderer/src/components/SignatureEditor.tsx',
        'apps/desktop/renderer/src/components/NearbyOperatorsModal.tsx',
        'apps/desktop/renderer/src/components/StickyNote.tsx',
        'apps/desktop/renderer/src/components/InvoiceEditor.tsx',
        'apps/desktop/renderer/src/components/InvoiceEmailModal.tsx',
        'apps/desktop/renderer/src/components/OnboardingWizard.tsx',
        'apps/desktop/renderer/src/components/BusinessProfileTab.tsx',
        'apps/desktop/renderer/src/components/AgencySettingsTab.tsx',
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
