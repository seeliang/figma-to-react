import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{ai-plugin,packages}/*/test/**/*.test.ts'],
  },
})
