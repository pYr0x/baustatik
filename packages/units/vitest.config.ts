import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.browser.test.ts', '**/*.spec.ts'],
    },
    projects: [
      {
        test: {
          name: { label: 'Unit', color: 'green' },
          include: ['**/*.test.ts'],
          exclude: ['**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: { label: 'Browser', color: 'blue' },
          include: ['**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
