import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Die Orakel vernetzen und loesen echt: rund 4000 Tri6-Elemente je Figur,
    // und der Halbkreis laeuft zweimal. Die Voreinstellung von 5 s traegt das
    // nicht.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
