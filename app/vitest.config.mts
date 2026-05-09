import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Run all integration spec files in a single fork with shared module
    // state so Payload's `getPayload` singleton (and the schema it pushes
    // on first init) is reused across specs. Without this, every spec
    // boots Payload fresh and subsequent specs hit "relation already
    // exists" when `pushDevSchema` re-creates tables in the same DB.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    isolate: false,
  },
})
