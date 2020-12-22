import resolve from '@rollup/plugin-node-resolve';
import svelte from 'rollup-plugin-svelte';
import css from 'rollup-plugin-css-only'

const production = !process.env.ROLLUP_WATCH;

export default {
    input: 'src/main.js',
    output: {
        file: 'public/build/bundle.js',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        resolve(),
        svelte({
            compilerOptions: {
                // enable run-time checks when not in production
                dev: !production
            }
        }),
        css({ output: 'bundle.css' })
    ]
};