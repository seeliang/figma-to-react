import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

/**
 * The plugin pair every design-system package needs, in one place.
 *
 * Hoisted because omitting `tailwindcss()` does not error — the app builds, the
 * stories render, and everything is silently unstyled at browser defaults. That
 * failure has already cost this repo a debugging session once; four copies of
 * the list is four chances to repeat it.
 */
export const designSystemPlugins = (): PluginOption[] => [react(), tailwindcss()]
