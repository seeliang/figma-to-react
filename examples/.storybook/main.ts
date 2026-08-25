import type { StorybookConfig } from '@storybook/react-vite'

/**
 * Stories live beside the components they document, because both are generated
 * into the same directory by `figma2react gen --stories`.
 *
 * Vite config is deliberately not redeclared here: Storybook merges the
 * project's `vite.config.ts`, which is where `@tailwindcss/vite` is registered.
 * Duplicating it is how the plugin ends up missing from one of the two, and a
 * missing Tailwind plugin fails silently — stories render, unstyled.
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-designs', '@storybook/addon-vitest'],
}

export default config
