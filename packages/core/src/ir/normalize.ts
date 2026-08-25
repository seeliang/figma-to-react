import type { ComponentMeta, FigmaNode, NodeType, StyleMeta } from '../figma/types.js'
import { toLayout } from './layout.js'
import { toBoxStyle, toTextStyle } from './style.js'
import type { StyleContext } from './style.js'
import type { IRDocument, IRKind, IRNode } from './types.js'

export interface NormalizeInput {
  fileKey: string
  document: FigmaNode
  components?: Record<string, ComponentMeta>
  componentSets?: Record<string, ComponentMeta>
  styles?: Record<string, StyleMeta>
}

/**
 * Node types that cannot be expressed as a styled div and must be rendered by
 * Figma into an SVG. `ELLIPSE` and `RECTANGLE` are deliberately absent: a plain
 * ellipse is a div with `rounded-full`, and only picks up vector treatment when
 * it carries geometry we cannot reproduce (see {@link needsVectorExport}).
 */
const VECTOR_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'STAR',
  'LINE',
  'REGULAR_POLYGON',
])

export function normalize(input: NormalizeInput): IRDocument {
  const ctx: StyleContext = { styles: input.styles ?? {} }
  const components = new Map<string, IRNode>()
  const componentNames = { ...(input.components ?? {}), ...(input.componentSets ?? {}) }

  const root = visit(input.document, undefined, ctx, componentNames, components)
  if (!root) {
    throw new Error(`Root node ${input.document.id} (${input.document.name}) is not visible`)
  }

  return { root, fileKey: input.fileKey, components }
}

function visit(
  node: FigmaNode,
  parent: FigmaNode | undefined,
  ctx: StyleContext,
  componentNames: Record<string, ComponentMeta>,
  components: Map<string, IRNode>,
): IRNode | undefined {
  // Invisible layers and masks produce no markup. Masks in particular would
  // otherwise render as opaque rectangles over the content they clip.
  if (node.visible === false || node.isMask) return undefined

  const kind = classify(node)

  const ir: IRNode = {
    id: node.id,
    name: node.name,
    kind,
    layout: toLayout(node, parent),
    box: toBoxStyle(node, ctx),
    children: [],
  }

  if (kind === 'text') {
    const text = toTextStyle(node, ctx)
    if (text) ir.text = text
    ir.content = node.characters ?? ''
    // On a text node the fill *is* the glyph colour, already captured in
    // `text.color`. Leaving it on the box would paint it as a background too.
    delete ir.box.fill
  }

  if (kind === 'vector') {
    ir.asset = { kind: 'svg', ref: node.id }
    // The SVG carries its own paint; keeping the node's fill would double it up.
    delete ir.box.fill
  }

  if (kind === 'image' && ir.box.fill?.kind === 'image') {
    ir.asset = { kind: 'image', ref: ir.box.fill.imageRef }
  }

  if (kind === 'instance' && node.componentId) {
    ir.component = {
      id: node.componentId,
      name: componentNames[node.componentId]?.name ?? node.name,
    }
  }

  // Vector subtrees are flattened into one exported SVG, so their children are
  // intentionally not walked.
  if (kind !== 'vector') {
    for (const child of node.children ?? []) {
      const childIr = visit(child, node, ctx, componentNames, components)
      if (childIr) ir.children.push(childIr)
    }
  }

  // Record the first occurrence of each component so the emitter can generate
  // it once and import it everywhere else.
  if (kind === 'instance' && ir.component && !components.has(ir.component.id)) {
    components.set(ir.component.id, ir)
  }

  return ir
}

function classify(node: FigmaNode): IRKind {
  if (node.type === 'TEXT') return 'text'
  if (needsVectorExport(node)) return 'vector'
  if (node.type === 'INSTANCE' && node.componentId) return 'instance'
  if (hasImageFill(node) && (node.children?.length ?? 0) === 0) return 'image'
  return 'box'
}

function needsVectorExport(node: FigmaNode): boolean {
  if (VECTOR_TYPES.has(node.type)) return true
  // A group whose every descendant is a vector is an icon; exporting it whole
  // beats emitting one <svg> per path.
  if (node.type === 'GROUP' && (node.children?.length ?? 0) > 0) {
    return node.children!.every((c) => c.visible === false || needsVectorExport(c))
  }
  return false
}

const hasImageFill = (node: FigmaNode): boolean =>
  (node.fills ?? []).some((f) => f.type === 'IMAGE' && f.visible !== false)

/** Depth-first walk over an IR tree, parents before children. */
export function walk(
  node: IRNode,
  fn: (n: IRNode, parent?: IRNode) => void,
  parent?: IRNode,
): void {
  fn(node, parent)
  for (const child of node.children) walk(child, fn, node)
}
