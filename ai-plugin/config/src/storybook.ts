import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Vite config is deliberately not restated here: Storybook merges the project's
 * own `vite.config.ts`. Declaring plugins in both is how one copy ends up
 * missing a plugin, and a missing plugin fails silently rather than loudly.
 */
export const storybookConfig = (stories: string[]): StorybookConfig => ({
  framework: '@storybook/react-vite',
  stories,
  addons: ['@storybook/addon-designs', '@storybook/addon-vitest'],
})
