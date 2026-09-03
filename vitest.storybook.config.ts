import { storybookProject } from '@figma-to-react/config/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { projects: [storybookProject()] } })
