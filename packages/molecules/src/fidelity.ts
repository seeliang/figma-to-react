import { expectLayoutWithin as assertWithin } from '@figma-to-react/testing/fidelity'
import geometry from '@ds/theme/figma-geometry.json' with { type: 'json' }

export const expectLayoutWithin = (container: HTMLElement, thresholdPx: number) =>
  assertWithin(container, thresholdPx, geometry)
