import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BaustatikKonvaAdapter',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['konva', /^@baustatik\//],
    },
  },
  plugins: [
    dts({
      rollupTypes: false,
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
    }),
  ],
});
