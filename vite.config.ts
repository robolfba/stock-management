import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    root: 'src/renderer',
    base: './',
    resolve: {
        alias: {
            '@shared': resolve(__dirname, 'src/shared'),
        },
    },
    build: {
        outDir: resolve(__dirname, 'dist/renderer'),
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'src/renderer/index.html'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
})
