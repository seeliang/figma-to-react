import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // `fidelity.html` mounts the generated root unscaled, for measuring it
      // against the Figma geometry.
      input: { main: 'index.html', fidelity: 'fidelity.html' },
    },
  },
})
