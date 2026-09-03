import type { FigmaNode } from './figma/types.js'

/**
 * Sorts components into atomic-design layers.
 *
 * The model is three layers — atoms, molecules, organisms — with the theme held
 * separately, per
 * https://seeliang.medium.com/implementation-of-atomic-design-67301cb0e09b
 *
 * The layer is a **design decision**, so this module never records one on its
 * own. It resolves a layer that somebody declared, and where nobody has, it
 * offers a suggestion with the evidence behind it so the decision can be made
 * quickly rather than from a blank sheet. Mis-sorting is the expensive mistake
 * the article warns about; a wrong guess written to disk is worse than no guess.
 */

export type Layer = 'atom' | 'molecule' | 'organism'

/** Where a resolved layer came from, in the order they are consulted. */
export type LayerSource = 'section' | 'prefix' | 'override'

export interface LayerEvidence {
  /** Elements the emitter will produce, counting a text-only container as one. */
  elements: number
  /** Names of components this one instantiates. */
  includes: string[]
  width: number
  /** Width of the frame the components were read from. */
  frameWidth: number
  /** Spans the frame edge to edge, or is set to FILL. */
  fullWidth: boolean
  /** A direct child of the frame, which is where organisms sit. */
  rootLevel: boolean
}

export interface LayerAssignment {
  id: string
  /** The component or component-set name, as it appears in Figma. */
  name: string
  /** Present only when somebody declared it. */
  layer?: Layer
  source?: LayerSource
  /**
   * What the structure implies. Absent when the signals disagree — a one-element
   * full-width divider is an atom by structure and an organism by width, and
   * picking one is exactly the mis-sort that costs a refactor.
   */
  suggested?: Layer
  /** Why: the evidence in words, or the nature of the conflict. */
  reason: string
  evidence: LayerEvidence
}

export interface AtomicInput {
  document: FigmaNode
  /** From `design-system.json`, for components the file cannot express. */
  overrides?: Record<string, Layer>
}

const SECTION_LAYER = /^\s*(atoms?|molecules?|organisms?)\s*$/i
const PREFIX_LAYER = /^\s*(atoms?|molecules?|organisms?)\s*\/\s*/i

/** Widths within 2% of the frame read as edge to edge; Figma rounds. */
const FULL_WIDTH_RATIO = 0.98

export function assignLayers({ document, overrides = {} }: AtomicInput): LayerAssignment[] {
  const frameWidth = document.absoluteBoundingBox?.width ?? 0
  const parents = new Map<string, FigmaNode>()
  const index = (n: FigmaNode) => {
    for (const c of n.children ?? []) {
      parents.set(c.id, n)
      index(c)
    }
  }
  index(document)

  return components(document).map((node) => {
    // A set is the unit; its variants share one structure, so measure the first.
    const sample = node.type === 'COMPONENT_SET' ? (variants(node)[0] ?? node) : node
    const width = sample.absoluteBoundingBox?.width ?? 0
    const evidence: LayerEvidence = {
      elements: countElements(sample),
      includes: instanceNames(sample),
      width,
      frameWidth,
      fullWidth:
        sample.layoutSizingHorizontal === 'FILL' ||
        (frameWidth > 0 && width >= frameWidth * FULL_WIDTH_RATIO),
      rootLevel: parents.get(node.id)?.id === document.id,
    }

    const declared = resolveLayer(node, parents, overrides)
    const { suggested, reason } = suggest(evidence)
    return {
      id: node.id,
      name: node.name,
      ...declared,
      suggested,
      reason,
      evidence,
    }
  })
}

/**
 * The unit of sorting is the component, so a variant set counts once and its
 * variants are not sorted separately — `Button` is an atom, not six atoms.
 */
export function components(document: FigmaNode): FigmaNode[] {
  const found: FigmaNode[] = []
  const walk = (n: FigmaNode, insideSet: boolean) => {
    if (n.visible === false) return
    if (n.type === 'COMPONENT_SET') {
      found.push(n)
      for (const c of n.children ?? []) walk(c, true)
      return
    }
    if (n.type === 'COMPONENT' && !insideSet) found.push(n)
    for (const c of n.children ?? []) walk(c, insideSet)
  }
  walk(document, false)
  return found
}

const variants = (set: FigmaNode) => (set.children ?? []).filter((c) => c.type === 'COMPONENT')

/**
 * Counts what the emitter will actually render, not what Figma holds. A frame
 * whose only child is a text layer collapses into one `<button>` or `<input>`,
 * which is why an Input Field is an atom and not a two-element molecule.
 */
export function countElements(node: FigmaNode): number {
  const kids = (node.children ?? []).filter((c) => c.visible !== false)
  if (kids.length === 0) return 1
  if (kids.length === 1 && kids[0]!.type === 'TEXT') return 1
  return 1 + kids.reduce((sum, c) => sum + countElements(c), 0)
}

function instanceNames(node: FigmaNode): string[] {
  const found: string[] = []
  const walk = (n: FigmaNode) => {
    if (n.visible === false) return
    if (n.type === 'INSTANCE') found.push(n.name)
    n.children?.forEach(walk)
  }
  node.children?.forEach(walk)
  return [...new Set(found)]
}

function resolveLayer(
  node: FigmaNode,
  parents: Map<string, FigmaNode>,
  overrides: Record<string, Layer>,
): { layer?: Layer; source?: LayerSource } {
  // The file is consulted before the config: the sorting decision belongs in
  // Figma, where the designer and developer make it together. The override
  // exists for what the file cannot be restructured to express.
  for (let p = parents.get(node.id); p; p = parents.get(p.id)) {
    const m = SECTION_LAYER.exec(p.name)
    if (m) return { layer: singular(m[1]!), source: 'section' }
  }
  const prefix = PREFIX_LAYER.exec(node.name)
  if (prefix) return { layer: singular(prefix[1]!), source: 'prefix' }

  const override = overrides[node.name] ?? overrides[stripPrefix(node.name)]
  if (override) return { layer: override, source: 'override' }

  return {}
}

const singular = (word: string): Layer => word.toLowerCase().replace(/s$/, '') as Layer

export const stripPrefix = (name: string) => name.replace(PREFIX_LAYER, '').trim()

/**
 * The article's checklist, applied to what the structure shows. Conflicting
 * signals deliberately produce no suggestion.
 */
function suggest(e: LayerEvidence): { suggested?: Layer; reason: string } {
  const size = `${round(e.width)}px of ${round(e.frameWidth)}px`
  const includes = e.includes.length ? `includes ${e.includes.join(', ')}` : 'no nested components'

  if (e.fullWidth && e.elements === 1) {
    return {
      reason: `1 element says atom, but it spans the frame (${size}) which says organism — which is it?`,
    }
  }
  if (e.fullWidth) {
    const where = e.rootLevel ? ', a direct child of the frame' : ''
    return { suggested: 'organism', reason: `spans the frame edge to edge (${size})${where}` }
  }
  if (e.elements === 1 && e.includes.length === 0) {
    return { suggested: 'atom', reason: `1 element, no nested components, ${size}` }
  }
  return {
    suggested: 'molecule',
    reason: `${e.elements} elements, ${includes}, ${size}`,
  }
}

const round = (n: number) => Math.round(n)
