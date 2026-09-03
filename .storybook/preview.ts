import type { Preview } from '@storybook/react-vite'
import './styles.css'

const preview: Preview = {
  parameters: { layout: 'centered', controls: { matchers: { color: /(background|color)$/i } } },
}

export default preview
