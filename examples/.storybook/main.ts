import { storybookConfig } from '@ds/config/storybook'

/**
 * Stories live beside the components they document, because both are generated
 * into the same directory by `figma2react gen --stories`.
 */
export default storybookConfig(['../src/**/*.stories.tsx'])
