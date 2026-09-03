import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{tools,packages}/*/test/**/*.test.ts'],
  },
})
