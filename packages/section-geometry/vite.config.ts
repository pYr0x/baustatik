import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'BaustatikSectionGeometry',
            fileName: 'index',
            formats: ['es'],
        },
        rollupOptions: {
            external: ['konva', 'martinez-polygon-clipping'],
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
