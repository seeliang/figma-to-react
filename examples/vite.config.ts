import { designSystemPlugins } from '@figma-to-react/config/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: designSystemPlugins(),
  build: {
    rollupOptions: {
      // `fidelity.html` mounts the generated root unscaled, for measuring it
      // against the Figma geometry.
      input: { main: 'index.html', fidelity: 'fidelity.html' },
    },
  },
})
