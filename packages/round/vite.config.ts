import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BaustatikRound',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: [],
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
});
