import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
  // M0.1.2 — Vitest config. jsdom so DOM APIs (window, document) are
  // available; setupFiles wires @testing-library/jest-dom matchers.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // M0.1.3 — keep Playwright specs out of Vitest's discovery; Playwright
    // owns the e2e/ tree (different runner, different test() signature).
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
})
