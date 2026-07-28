import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: ['src/declarations.ts'],
    },
    projects: [
      {
        test: {
          name: { label: 'Unit', color: 'green' },
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
