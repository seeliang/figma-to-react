import type { FigmaNode } from '@figma-to-react/core'

/**
 * The geometry a rendered page is measured against.
 *
 * Comparing generated markup to Figma by eye finds bugs in proportion to how
 * obvious they are; this is what makes the comparison a number. It was a
 * throwaway script until now, which meant the file could not be regenerated
 * when the design changed.
 */

export interface NodeBox {
  name: string
  type: string
  /** Offset from the exported root's own origin, so the two frames of reference line up. */
  x: number
  y: number
  w: number
  h: number
}

export type Geometry = Record<string, NodeBox>

export function exportGeometry(root: FigmaNode): Geometry {
  const origin = root.absoluteBoundingBox
  if (!origin) return {}

  const out: Geometry = {}
  const visit = (node: FigmaNode) => {
    // Skip what produces no element: there is nothing to measure, and an entry
    // would look like a node the renderer had lost.
    if (node.visible === false || node.isMask) return
    const b = node.absoluteBoundingBox
    if (b) {
      out[node.id] = {
        name: node.name,
        type: node.type,
        x: round(b.x - origin.x),
        y: round(b.y - origin.y),
        w: round(b.width),
        h: round(b.height),
      }
    }
    node.children?.forEach(visit)
  }
  visit(root)
  return out
}

const round = (n: number) => Math.round(n * 100) / 100
