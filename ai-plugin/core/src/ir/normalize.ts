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
  /**
   * `VariableID:… → name`. The REST API sends bound Variables as bare ids, so
   * without this every Variable-bound token is named from its value — and two
   * Variables sharing a value collapse into one token. See
   * {@link ../tokens/palette.ts readPalette} for where the names come from.
   */
  variables?: Record<string, string>
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
  const ctx: StyleContext = { styles: input.styles ?? {}, variables: input.variables ?? {} }
  const components = new Map<string, IRNode>()
  const componentNames = { ...(input.components ?? {}), ...(input.componentSets ?? {}) }

  // Resolve every component's display name up front: an INSTANCE may appear
  // before the COMPONENT it points at, and the name depends on the component's
  // parent variant set, which is only visible from above.
  const names = collectComponentNames(
    input.document,
    input.components ?? {},
    input.componentSets ?? {},
  )

  const root = visit(input.document, undefined, ctx, names, components)
  if (!root) {
    throw new Error(`Root node ${input.document.id} (${input.document.name}) is not visible`)
  }

  return { root, fileKey: input.fileKey, components }
}

/**
 * Figma names a variant by its properties (`State=Default`), which is only
 * meaningful next to the variant set's own name. `Input Field` + `State=Default`
 * reads as `InputFieldDefault`; the bare variant name would collide across every
 * set in the file.
 */
function collectComponentNames(
  root: FigmaNode,
  components: Record<string, ComponentMeta>,
  componentSets: Record<string, ComponentMeta>,
): Map<string, ComponentIdentity> {
  const names = new Map<string, ComponentIdentity>()

  const visitNames = (node: FigmaNode, parent?: FigmaNode) => {
    if (node.type === 'COMPONENT') {
      names.set(node.id, componentIdentity(node, parent))
    }
    for (const child of node.children ?? []) visitNames(child, node)
  }
  visitNames(root)

  // A component defined in another file never appears in this tree, so its
  // variant set has to be recovered from the response instead: the component
  // map carries `componentSetId`, and the set map carries that set's name.
  // Published variants are named `Button/Primary` rather than `Type=Primary`.
  for (const [id, m] of Object.entries(components)) {
    if (names.has(id)) continue
    const setName = m.componentSetId ? componentSets[m.componentSetId]?.name : undefined
    if (!setName) {
      names.set(id, { name: m.name })
      continue
    }
    const variant = m.name.startsWith(`${setName}/`) ? m.name.slice(setName.length + 1) : m.name
    names.set(id, { name: m.name, set: setName, variant })
  }

  // Sets themselves are addressable but are only a canvas grouping.
  for (const [id, m] of Object.entries(componentSets)) {
    if (!names.has(id)) names.set(id, { name: m.name })
  }
  return names
}

export interface ComponentIdentity {
  name: string
  set?: string
  variant?: string
}

function componentIdentity(node: FigmaNode, parent?: FigmaNode): ComponentIdentity {
  if (parent?.type !== 'COMPONENT_SET') return { name: node.name }
  // `Type=Primary, Size=Large` -> `Primary Large`
  const variant = node.name
    .split(',')
    .map((part) => part.split('=').slice(1).join('=').trim())
    .filter(Boolean)
    .join(' ')
  return variant
    ? { name: `${parent.name} ${variant}`, set: parent.name, variant }
    : { name: parent.name, set: parent.name }
}

function visit(
  node: FigmaNode,
  parent: FigmaNode | undefined,
  ctx: StyleContext,
  componentNames: Map<string, ComponentIdentity>,
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
    layout: toLayout(node, ctx, parent),
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
      ...(componentNames.get(node.componentId) ?? { name: node.name }),
    }
  }

  // A COMPONENT node is the definition itself, keyed by its own id — the same
  // id an INSTANCE points at through `componentId`.
  if (kind === 'component') {
    ir.component = { id: node.id, ...(componentNames.get(node.id) ?? { name: node.name }) }
  }

  // Vector subtrees are flattened into one exported SVG, so their children are
  // intentionally not walked.
  if (kind !== 'vector') {
    for (const child of node.children ?? []) {
      const childIr = visit(child, node, ctx, componentNames, components)
      if (childIr) ir.children.push(childIr)
    }
  }

  // Register the component so the emitter generates it once and imports it
  // everywhere else. A real COMPONENT definition always wins over an INSTANCE
  // of it, which only carries that one call site's overrides.
  if (ir.component && (kind === 'component' || !components.has(ir.component.id))) {
    components.set(ir.component.id, ir)
  }

  return ir
}

function classify(node: FigmaNode): IRKind {
  if (node.type === 'TEXT') return 'text'
  if (needsVectorExport(node)) return 'vector'
  // A COMPONENT_SET is only a canvas grouping of variants; it has no runtime
  // meaning, so it stays a plain box holding one tag per variant.
  if (node.type === 'COMPONENT') return 'component'
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
