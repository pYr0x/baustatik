import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
