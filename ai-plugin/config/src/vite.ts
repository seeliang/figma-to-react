import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'

/**
 * The plugin pair every design-system package needs, in one place.
 *
 * Shared so all package previews use the same React transform.
 */
export const designSystemPlugins = (): PluginOption[] => [react()]
