import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/error-tracker/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // The server has its own vitest config with a Node environment
    exclude: [...configDefaults.exclude, 'server/**'],
    css: false,
  },
})
