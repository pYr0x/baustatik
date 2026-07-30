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
          include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: { label: 'Browser', color: 'blue' },
          include: ['tests/browser/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
// export default defineConfig({
//   test: {
//     browser: {
//       provider: playwright(),
//       enabled: true,
//       // at least one instance is required
//       instances: [
//         { browser: 'chromium' },
//       ],
//     },
//   }
// })
