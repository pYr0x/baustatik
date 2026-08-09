import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BaustatikGeometry2d',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      // Beide Clipping-Bibliotheken bleiben außen vor: sie sind Abhängigkeiten
      // und keine Bestandteile dieses Bundles (ADR 0037).
      external: ['clipper2-ts', 'martinez-polygon-clipping'],
    },
  },
  plugins: [
    dts({
      // Für "Klick in Source" meist besser:
      rollupTypes: false,

      // sicherstellen, dass TS-Optionen an sind (falls base tsconfig das nicht setzt)
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
