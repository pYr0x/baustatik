import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BaustatikGeometry2d',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['martinez-polygon-clipping'],
    },
  },
  plugins: [
    dts({
      rollupTypes: false,
      skipDiagnostics: true,
      compilerOptions: {
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        rootDir: '../..',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})


