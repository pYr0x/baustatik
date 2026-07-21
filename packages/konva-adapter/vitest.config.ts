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
        // Reine Config-/Geometrie-Logik. Kein Konva, laeuft in CI.
        test: {
          name: { label: 'Unit', color: 'green' },
          include: ['test/node/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['**/*.browser.test.ts', '**/*.screenshot.test.ts'],
          environment: 'node',
        },
      },
      {
        // Verhaltenstests gegen echtes Konva OHNE Pixelvergleich —
        // plattformunabhaengig, deshalb in CI.
        test: {
          name: { label: 'Browser', color: 'blue' },
          include: ['test/browser/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        // Screenshot-Vergleich je Primitive. Baselines sind plattformabhaengig
        // (Anti-Aliasing), daher NUR lokal via `test:screenshot`.
        test: {
          name: { label: 'Screenshot', color: 'magenta' },
          include: ['test/screenshot/**/*.screenshot.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            expect: {
              toMatchScreenshot: {
                // Baselines nach Browser+Plattform getrennt ablegen, damit
                // spaeter Linux-Referenzen ohne Umstrukturierung dazukommen.
                resolveScreenshotPath: ({
                  root,
                  testFileDirectory,
                  arg,
                  browserName,
                  platform,
                  ext,
                }) =>
                  `${root}/${testFileDirectory}/__screenshots__/${browserName}-${platform}/${arg}${ext}`,
              },
            },
          },
        },
      },
    ],
  },
});
