import { storybookProject } from '@figma-to-react/config/vitest'
import { defineConfig } from 'vitest/config'

// The project shape — browser mode, the Tailwind plugin, the setup file — lives
// in @figma-to-react/config so every package that runs stories runs them identically.
export default defineConfig({ test: { projects: [storybookProject()] } })
