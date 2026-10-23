import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  esbuild: {
    // Allow PrismaClient by not transforming certain patterns
    target: 'es2022',
    supported: {
      // Keep Promise etc working
      Promise: true,
    },
  },
})