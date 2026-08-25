import type { Preview } from '@storybook/react-vite'

// The single stylesheet, so the fonts-first import order lives in exactly one
// place. Restating those imports here is how that order silently breaks.
import '../src/styles.css'

const preview: Preview = {
  parameters: {
    layout: 'centered',
    controls: { matchers: { color: /(background|color)$/i } },
  },
}

export default preview
