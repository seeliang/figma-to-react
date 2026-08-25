import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

/**
 * Runs every story as a test, executing its play function — which is where the
 * layout-fidelity assertions live. Stories run in a real browser because
 * `getBoundingClientRect()` is the measurement; jsdom reports zeroes.
 *
 * The plugins are restated because Vitest does not pick up `vite.config.ts`
 * here. Leaving Tailwind out does not error: the stories render, unstyled, at
 * browser default sizes. That showed up as every story failing by ~57px wide
 * and 20px short, which is what an unstyled `<input>` measures.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react(), tailwindcss(), storybookTest({ configDir: '.storybook' })],
        test: {
          name: 'storybook',
          setupFiles: ['./.storybook/vitest.setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
