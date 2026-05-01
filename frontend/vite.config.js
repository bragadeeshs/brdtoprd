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
  // Bundle code-split — single 580 KB chunk was crossing Vite's 500 KB
  // warning since M8.x. Vendor groups split out the third-party halves
  // (react/router, Clerk, Sentry) so they cache independently of app code,
  // and route-level React.lazy in App.jsx splits per page.
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'clerk': ['@clerk/clerk-react'],
        },
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
