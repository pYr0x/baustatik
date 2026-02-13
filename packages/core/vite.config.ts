import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'BaustatikCore',
            fileName: 'index',
            formats: ['es']
        },
        rollupOptions: {
            external: []
        }
    },
    plugins: [dts({ rollupTypes: true })]
});
