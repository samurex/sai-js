import { defineConfig } from 'vitest/config'

// Replaces the deprecated `vitest.workspace.ts` (removed in vitest 5):
// the root project only runs the package unit tests — `test/` is the
// dagger-driven integration suite with its own config.
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
})
