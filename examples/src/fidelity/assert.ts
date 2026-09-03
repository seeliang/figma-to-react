import {
  type Delta,
  type Geometry,
  type NodeBox,
  expectLayoutWithin as assertWithin,
  measure as measureAgainst,
} from '@ds/testing/fidelity'
import geometry from '../design-system/figma-geometry.json'

/**
 * Binds this app's geometry to the shared helper.
 *
 * The arithmetic moved to @ds/testing; what stays here is the one thing that is
 * genuinely local — *which* generated directory's geometry to measure against.
 * That is also why the helper takes it as an argument now: a static import
 * pinned it to a single output, which stops working the moment each layer ships
 * its own.
 */
export const geometryById = geometry as Geometry

export type { NodeBox, Delta, Geometry }
export { worstDelta } from '@ds/testing/fidelity'

export const measure = (container?: HTMLElement | Document): Delta[] =>
  measureAgainst(geometryById, container)

export const expectLayoutWithin = (container: HTMLElement, thresholdPx: number): Promise<void> =>
  assertWithin(container, thresholdPx, geometryById)
