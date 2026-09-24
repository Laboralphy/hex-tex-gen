import { defineConfig } from 'tsdown';

export default defineConfig([
    {
        entry: ['src/index.ts'],
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        target: 'es2022',
        platform: 'neutral',
    },
    {
        entry: { cli: 'src/cli/index.ts' },
        dts: false,
        format: ['esm'],
        sourcemap: true,
        clean: false,
        target: 'node18',
        platform: 'node',
    },
]);
