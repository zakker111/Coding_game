import { readFileSync } from 'node:fs'
import path, { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const siteRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(siteRoot, '..')

const pkg = JSON.parse(readFileSync(path.join(siteRoot, 'package.json'), 'utf8')) as {
  version: string
}

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
  },
})
