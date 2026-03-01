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
    ],
  },
});
