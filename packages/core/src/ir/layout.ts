import type { AxisAlign, FigmaNode, LayoutSizing } from '../figma/types.js'
import { length } from './style.js'
import type { Layout, Padding, Sizing } from './types.js'

/**
 * Auto Layout maps onto flexbox almost one-to-one. The awkward parts are
 * sizing and the older files that predate `layoutSizing*`.
 */
export function toLayout(node: FigmaNode, parent?: FigmaNode): Layout {
  const mode = node.layoutMode ?? 'NONE'
  const isFlex = mode === 'HORIZONTAL' || mode === 'VERTICAL'

  const layout: Layout = {
    mode: isFlex ? 'flex' : 'none',
    wrap: node.layoutWrap === 'WRAP',
    width: sizing(node, parent, 'horizontal'),
    height: sizing(node, parent, 'vertical'),
    grow: growsAlongParentAxis(node, parent),
  }

  if (isFlex) {
    layout.direction = mode === 'HORIZONTAL' ? 'row' : 'column'
    if (node.itemSpacing) layout.gap = length(node.itemSpacing, node, 'itemSpacing')
    if (node.layoutWrap === 'WRAP' && node.counterAxisSpacing) {
      layout.crossGap = length(node.counterAxisSpacing, node, 'counterAxisSpacing')
    }
    const justify = mapPrimary(node.primaryAxisAlignItems)
    if (justify) layout.justify = justify
    const align = mapCounter(node.counterAxisAlignItems)
    if (align) layout.align = align
  }

  const padding = toPadding(node)
  if (padding) layout.padding = padding

  const selfAlign = mapSelfAlign(node.layoutAlign)
  if (selfAlign) layout.alignSelf = selfAlign

  // Absolute fallback: only meaningful when the parent gave no layout intent.
  if (parent && (parent.layoutMode ?? 'NONE') === 'NONE') {
    const box = node.absoluteBoundingBox
    const parentBox = parent.absoluteBoundingBox
    if (box && parentBox) {
      layout.position = { x: round(box.x - parentBox.x), y: round(box.y - parentBox.y) }
    }
  }

  return layout
}

function toPadding(node: FigmaNode): Padding | undefined {
  const { paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0 } = node
  if (!paddingTop && !paddingRight && !paddingBottom && !paddingLeft) return undefined
  return {
    top: length(paddingTop, node, 'paddingTop'),
    right: length(paddingRight, node, 'paddingRight'),
    bottom: length(paddingBottom, node, 'paddingBottom'),
    left: length(paddingLeft, node, 'paddingLeft'),
  }
}

const mapPrimary = (a?: AxisAlign): Layout['justify'] => {
  switch (a) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'SPACE_BETWEEN':
      return 'between'
    // MIN is flexbox's default; emitting `justify-start` is noise.
    default:
      return undefined
  }
}

const mapCounter = (a?: AxisAlign): Layout['align'] => {
  switch (a) {
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'BASELINE':
      return 'baseline'
    case 'MIN':
      // Not the default: flexbox stretches by default, Figma's MIN does not.
      return 'start'
    default:
      return undefined
  }
}

const mapSelfAlign = (a?: FigmaNode['layoutAlign']): Layout['alignSelf'] => {
  switch (a) {
    case 'STRETCH':
      return 'stretch'
    case 'CENTER':
      return 'center'
    case 'MAX':
      return 'end'
    case 'MIN':
      return 'start'
    default:
      return undefined
  }
}

/**
 * `layoutSizingHorizontal` / `layoutSizingVertical` are the modern, explicit
 * signal — but they are absent from files not opened since Figma shipped them.
 * Fall back to the older pair of signals:
 *
 *   FILL → `layoutGrow: 1` on the main axis, `layoutAlign: STRETCH` on the cross
 *   HUG  → `primaryAxisSizingMode` / `counterAxisSizingMode` === 'AUTO'
 *   else → FIXED, from the bounding box
 */
function sizing(
  node: FigmaNode,
  parent: FigmaNode | undefined,
  axis: 'horizontal' | 'vertical',
): Sizing {
  const explicit = axis === 'horizontal' ? node.layoutSizingHorizontal : node.layoutSizingVertical
  const resolved: LayoutSizing = explicit ?? inferSizing(node, parent, axis)

  if (resolved === 'FILL') return { kind: 'fill' }
  if (resolved === 'HUG') return { kind: 'hug' }

  const box = node.absoluteBoundingBox
  const px = axis === 'horizontal' ? box?.width : box?.height
  return px === undefined ? { kind: 'hug' } : { kind: 'fixed', px: round(px) }
}

function inferSizing(
  node: FigmaNode,
  parent: FigmaNode | undefined,
  axis: 'horizontal' | 'vertical',
): LayoutSizing {
  const parentMode = parent?.layoutMode ?? 'NONE'
  const parentAxis =
    parentMode === 'HORIZONTAL' ? 'horizontal' : parentMode === 'VERTICAL' ? 'vertical' : undefined

  if (parentAxis === axis && node.layoutGrow === 1) return 'FILL'
  if (parentAxis && parentAxis !== axis && node.layoutAlign === 'STRETCH') return 'FILL'

  // A frame that hugs sizes itself from its own content, which only applies
  // when the node has Auto Layout of its own.
  const ownMode = node.layoutMode ?? 'NONE'
  if (ownMode !== 'NONE') {
    const ownAxis = ownMode === 'HORIZONTAL' ? 'horizontal' : 'vertical'
    const sizingMode = ownAxis === axis ? node.primaryAxisSizingMode : node.counterAxisSizingMode
    if (sizingMode === 'AUTO') return 'HUG'
  }

  // Text nodes with no explicit sizing hug by default in both axes.
  if (node.type === 'TEXT' && node.layoutGrow !== 1) return 'HUG'

  return 'FIXED'
}

function growsAlongParentAxis(node: FigmaNode, parent?: FigmaNode): boolean {
  const parentMode = parent?.layoutMode ?? 'NONE'
  if (parentMode === 'NONE') return false
  const axis = parentMode === 'HORIZONTAL' ? 'horizontal' : 'vertical'
  const explicit = axis === 'horizontal' ? node.layoutSizingHorizontal : node.layoutSizingVertical
  if (explicit) return explicit === 'FILL'
  return node.layoutGrow === 1
}

const round = (n: number) => Math.round(n * 100) / 100
