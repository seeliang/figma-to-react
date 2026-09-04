import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { designSystemPlugins } from './vite.js'

/**
 * Runs every story as a test, executing its play function — which is where the
 * fidelity and token assertions live.
 *
 * A real browser, not jsdom: `getBoundingClientRect()` is the measurement and
 * jsdom reports zeroes, and `getComputedStyle` there will not resolve `var()`.
 *
 * The plugins are restated because **Vitest does not read `vite.config.ts`**.
 * That is the whole reason this factory exists rather than a copied config:
 * leaving a plugin out of one of the two files does not error, it just makes
 * every story measure an unstyled element — which showed up once as every story
 * failing by ~57px wide, the width of a default `<input>`.
 */
export const storybookProject = (configDir = '.storybook') => ({
  plugins: [...designSystemPlugins(), storybookTest({ configDir })],
  test: {
    name: 'storybook',
    setupFiles: [`./${configDir}/vitest.setup.ts`],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
