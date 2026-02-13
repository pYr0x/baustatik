import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*',
  {
    test: {
      name: 'browser',
      include: ['**/*.browser.test.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        name: 'chromium',
      },
    },
  },
  {
    test: {
      name: 'unit',
      include: ['**/*.test.ts', '!**/*.browser.test.ts'],
      environment: 'happy-dom',
    },
  },
]);
