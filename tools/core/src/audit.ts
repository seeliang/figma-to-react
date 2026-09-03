import {
  type Layer,
  type LayerAssignment,
  assignLayers,
  components,
  stripPrefix,
} from './atomic.js'
import type { FigmaNode, StyleMeta } from './figma/types.js'

/**
 * Reports gaps that live in the **design file**, not in the generator.
 *
 * The two causes produce similar-looking bad output and want opposite
 * responses. A dropped font family is a bug here and gets fixed in code. A
 * colour with no Style bound to it is a design decision that was never made,
 * and no amount of code can invent the name the designer had in mind — the fix
 * is one action in Figma, and saying so is worth more than working around it.
 *
 * Every finding therefore names the Figma action that resolves it.
 */

export type Severity = 'high' | 'medium' | 'low'

export interface DesignFinding {
  code: string
  severity: Severity
  /** One line, stated as the consequence for the generated code. */
  title: string
  /** The Figma action that resolves it. */
  fix: string
  /** How many nodes are affected. */
  count: number
  /** A few example layer names, for locating it in the file. */
  examples: string[]
}

export interface AuditInput {
  document: FigmaNode
  styles?: Record<string, StyleMeta>
  /** Layer overrides from `design-system.json`, for what Figma cannot express. */
  layers?: Record<string, Layer>
  /** Specific / private / public, per component name. */
  ownership?: Record<string, string>
  /** Applied to components with no entry of their own. */
  defaultOwnership?: string
}

export function auditDesign({
  document,
  layers,
  ownership,
  defaultOwnership,
}: AuditInput): DesignFinding[] {
  const nodes: FigmaNode[] = []
  const collect = (n: FigmaNode) => {
    if (n.visible === false) return
    nodes.push(n)
    n.children?.forEach(collect)
  }
  collect(document)

  const assignments = assignLayers({ document, overrides: layers })

  const findings = [
    unboundColours(nodes),
    unboundFontSizes(nodes),
    missingAutoLayout(nodes),
    inconsistentVariantSizes(nodes),
    missingInteractiveStates(nodes),
    autoNamedText(nodes),
    // Atomic layering
    unclassifiedLayers(assignments),
    dependencyViolations(assignments),
    scopeSizeOverrides(document, nodes),
    mixedScope(document),
    atomsWithManyElements(assignments),
    organismsNotFullWidth(assignments),
    moleculesFullWidth(assignments),
    unownedComponents(assignments, ownership, defaultOwnership),
    missingBreakpoints(nodes),
  ].filter((f): f is DesignFinding => f !== undefined)

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count)
}

// ---------------------------------------------------------------------------

const hasSolidFill = (n: FigmaNode) =>
  (n.fills ?? []).some((f) => f.type === 'SOLID' && f.visible !== false)

const bound = (n: FigmaNode, styleField: string, varField: string) =>
  Boolean(n.styles?.[styleField]) || Boolean(n.boundVariables?.[varField])

function unboundColours(nodes: FigmaNode[]): DesignFinding | undefined {
  const offenders = nodes.filter((n) => hasSolidFill(n) && !bound(n, 'fill', 'fills'))
  if (offenders.length === 0) return undefined
  return {
    code: 'unbound-colours',
    severity: 'high',
    title: `${offenders.length} colour${plural(offenders.length)} bound to no Style or Variable, so token names are synthesised (--color-blue-600 rather than --color-primary)`,
    fix: 'In Figma, select the swatch and create a Colour Style, or bind a Variable. Style names come through on every plan; Variable names need Enterprise.',
    count: offenders.length,
    examples: names(offenders),
  }
}

function unboundFontSizes(nodes: FigmaNode[]): DesignFinding | undefined {
  const texts = nodes.filter((n) => n.type === 'TEXT' && n.style?.fontSize !== undefined)
  const offenders = texts.filter((n) => !n.boundVariables?.['fontSize'])
  if (offenders.length === 0) return undefined

  const scale = new Set(texts.map((n) => `${n.style!.fontSize}/${n.style!.fontWeight}`))
  return {
    code: 'unbound-font-sizes',
    severity: 'medium',
    title: `${scale.size} distinct type combination${plural(scale.size)} in use, none bound, so every size is emitted inline as text-[14px] rather than a named step`,
    fix: 'Bind font size to a Figma Variable to get --text-* theme entries. A Text Style alone is not enough: the REST API exposes only its colour per node.',
    count: offenders.length,
    examples: names(offenders),
  }
}

function missingAutoLayout(nodes: FigmaNode[]): DesignFinding | undefined {
  const offenders = nodes.filter(
    (n) =>
      (n.children?.length ?? 0) > 1 &&
      (n.layoutMode ?? 'NONE') === 'NONE' &&
      n.type !== 'COMPONENT_SET' &&
      n.type !== 'GROUP',
  )
  if (offenders.length === 0) return undefined
  return {
    code: 'no-auto-layout',
    severity: 'high',
    title: `${offenders.length} container${plural(offenders.length)} with no Auto Layout, so children are pinned with absolute left/top and the result does not reflow`,
    fix: 'Add Auto Layout (Shift+A) to those frames, or point gen at a frame that has it rather than at the enclosing section.',
    count: offenders.length,
    examples: names(offenders),
  }
}

function inconsistentVariantSizes(nodes: FigmaNode[]): DesignFinding | undefined {
  const offenders: FigmaNode[] = []
  for (const set of nodes.filter((n) => n.type === 'COMPONENT_SET')) {
    const variants = (set.children ?? []).filter((c) => c.type === 'COMPONENT')
    const widths = new Set(variants.map((v) => Math.round(v.absoluteBoundingBox?.width ?? 0)))
    // Variants of one component differing in size is usually a hug that was
    // never pinned, not a deliberate choice.
    if (widths.size > 1) offenders.push(set)
  }
  if (offenders.length === 0) return undefined
  return {
    code: 'variant-size-drift',
    severity: 'medium',
    title: `${offenders.length} component set${plural(offenders.length)} whose variants differ in width, so each renders at a different size`,
    fix: 'If they are meant to match, set the variants to a fixed or fill width instead of hug.',
    count: offenders.length,
    examples: names(offenders),
  }
}

const INTERACTIVE = /\b(button|btn|cta|link|toggle|switch|tab)\b/i
const STATEFUL = /\b(hover|press|active|focus|disabled)/i

function missingInteractiveStates(nodes: FigmaNode[]): DesignFinding | undefined {
  const offenders = nodes.filter((n) => {
    if (n.type !== 'COMPONENT_SET' || !INTERACTIVE.test(n.name)) return false
    return !(n.children ?? []).some((c) => STATEFUL.test(c.name))
  })
  if (offenders.length === 0) return undefined
  return {
    code: 'no-interactive-states',
    severity: 'medium',
    title: `${offenders.length} interactive component${plural(offenders.length)} with no hover, pressed or disabled variant, so the generated element has no state styling`,
    fix: 'Add a Hover / Pressed / Disabled variant. Nothing else can supply it — a hover colour the designer never chose would be invented, not generated.',
    count: offenders.length,
    examples: names(offenders),
  }
}

function autoNamedText(nodes: FigmaNode[]): DesignFinding | undefined {
  const texts = nodes.filter((n) => n.type === 'TEXT')
  const offenders = texts.filter((n) => n.name === n.characters)
  // Figma auto-names a text layer after its content until someone renames it,
  // so a handful is normal and only a wholesale pattern is worth reporting.
  if (offenders.length === 0 || offenders.length < texts.length * 0.8) return undefined
  return {
    code: 'auto-named-text',
    severity: 'low',
    title: `${offenders.length} of ${texts.length} text layers still carry their content as their name, so generated props read as n2563Eb rather than as label`,
    fix: 'Rename the text layers that should become props — the layer name becomes the prop name.',
    count: offenders.length,
    examples: names(offenders),
  }
}

// --- atomic layering -------------------------------------------------------

/**
 * Sorting is the critical step, and the article's own retrospective is that
 * getting it wrong cost days of refactoring. So an unsorted component is a
 * high finding — but it carries the suggestion, because the useful output is
 * "this looks like an atom", not "you have not sorted this".
 */
function unclassifiedLayers(all: LayerAssignment[]): DesignFinding | undefined {
  const offenders = all.filter((a) => !a.layer)
  if (offenders.length === 0) return undefined
  return {
    code: 'layer-unclassified',
    severity: 'high',
    title: `${offenders.length} component${plural(offenders.length)} not sorted into an atomic layer, so the output cannot be split into atoms/, molecules/ and organisms/`,
    fix:
      'Group them in Figma under sections named Atoms, Molecules and Organisms, or prefix the layer names (atom/Button). Suggested: ' +
      offenders
        .map((a) => `${a.name} → ${a.suggested ?? 'ambiguous, ' + a.reason}`)
        .slice(0, 4)
        .join('; '),
    count: offenders.length,
    examples: offenders.map((a) => a.name).slice(0, 3),
  }
}

/**
 * "Organisms can include other organisms molecules atoms / Molecules can
 * include other molecules atoms / Atoms can NOT include any other components."
 * Only checks components whose layer is declared — an unsorted one is already
 * reported above, and guessing its layer here would double-count a guess.
 */
function dependencyViolations(all: LayerAssignment[]): DesignFinding | undefined {
  const rank: Record<Layer, number> = { atom: 0, molecule: 1, organism: 2 }
  const byName = new Map(all.filter((a) => a.layer).map((a) => [stripPrefix(a.name), a]))

  const offenders: string[] = []
  for (const a of all) {
    if (!a.layer) continue
    for (const included of a.evidence.includes) {
      const child = byName.get(stripPrefix(included))
      if (!child?.layer) continue
      const upward = rank[child.layer] >= rank[a.layer]
      if (a.layer === 'atom' || upward) {
        offenders.push(`${a.name} (${a.layer}) includes ${included} (${child.layer})`)
      }
    }
  }
  if (offenders.length === 0) return undefined
  return {
    code: 'layer-dependency-violation',
    severity: 'high',
    title: `${offenders.length} component${plural(offenders.length)} including something at or above its own layer, so the layers cannot be packaged independently`,
    fix: 'Atoms include nothing; molecules include only molecules and atoms. Either move the child down a layer in Figma, or promote the parent.',
    count: offenders.length,
    examples: offenders.slice(0, 3),
  }
}

/**
 * The scope rule: a component owns its padding, its parent owns the space
 * around it. An instance resized away from its master is the parent reaching
 * inside the child, which is what stops the child being reusable as a whole.
 *
 * Note: Figma has no margin, and the REST response carries no override list, so
 * a resize is the part of the scope rule that is actually observable here.
 */
function scopeSizeOverrides(document: FigmaNode, nodes: FigmaNode[]): DesignFinding | undefined {
  const masters = new Map<string, FigmaNode>()
  const index = (n: FigmaNode) => {
    if (n.type === 'COMPONENT') masters.set(n.id, n)
    n.children?.forEach(index)
  }
  index(document)

  const offenders: string[] = []
  for (const n of nodes) {
    if (n.type !== 'INSTANCE' || !n.componentId) continue
    const master = masters.get(n.componentId)
    const a = n.absoluteBoundingBox
    const b = master?.absoluteBoundingBox
    if (!a || !b) continue
    if (
      Math.round(a.width) !== Math.round(b.width) ||
      Math.round(a.height) !== Math.round(b.height)
    )
      offenders.push(
        `${n.name} is ${Math.round(a.width)}×${Math.round(a.height)}, its master is ${Math.round(b.width)}×${Math.round(b.height)}`,
      )
  }
  if (offenders.length === 0) return undefined
  return {
    code: 'scope-size-override',
    severity: 'high',
    title: `${offenders.length} instance${plural(offenders.length)} resized away from its master, so the parent is controlling space that belongs to the child`,
    fix: 'Give the master a fill or fixed width so every instance matches, or add a size variant. A component that only fits after the parent resizes it cannot be reused as a whole.',
    count: offenders.length,
    examples: offenders.slice(0, 3),
  }
}

/**
 * The `<input class="organism-a__element">` inside `molecule-0` mistake: a
 * layer wearing another component's namespace. Deliberately narrow — it only
 * fires on the BEM-style `Name__part` and `Name/part` forms, so a file that
 * does not use them simply never trips it.
 */
function mixedScope(document: FigmaNode): DesignFinding | undefined {
  const owners = components(document).map((c) => stripPrefix(c.name))
  const offenders: string[] = []

  const walk = (n: FigmaNode, inside: string | undefined) => {
    if (n.visible === false) return
    const self = components(document).some((c) => c.id === n.id) ? stripPrefix(n.name) : inside
    if (inside) {
      for (const owner of owners) {
        if (owner === inside) continue
        const namespaced = new RegExp(`^${escapeRe(owner)}\\s*(__|/)`, 'i')
        if (namespaced.test(n.name)) offenders.push(`${n.name} sits inside ${inside}`)
      }
    }
    n.children?.forEach((c) => walk(c, self))
  }
  walk(document, undefined)

  if (offenders.length === 0) return undefined
  return {
    code: 'mixed-scope',
    severity: 'high',
    title: `${offenders.length} layer${plural(offenders.length)} named for a component it does not belong to, so the containing component cannot be consumed as a whole`,
    fix: 'Either move the layer out into the component that names it, or rename it to its own component and drive the difference with a variant or a prop.',
    count: offenders.length,
    examples: offenders.slice(0, 3),
  }
}

function atomsWithManyElements(all: LayerAssignment[]): DesignFinding | undefined {
  const offenders = all.filter((a) => a.layer === 'atom' && a.evidence.elements > 1)
  if (offenders.length === 0) return undefined
  return {
    code: 'atom-multi-element',
    severity: 'medium',
    title: `${offenders.length} atom${plural(offenders.length)} rendering more than one element, which is a molecule by the structure checklist`,
    fix: 'Move them to Molecules, or simplify them to a single element. An atom is one HTML tag with no internal functions.',
    count: offenders.length,
    examples: offenders.map((a) => `${a.name} (${a.evidence.elements} elements)`).slice(0, 3),
  }
}

function organismsNotFullWidth(all: LayerAssignment[]): DesignFinding | undefined {
  const offenders = all.filter((a) => a.layer === 'organism' && !a.evidence.fullWidth)
  if (offenders.length === 0) return undefined
  return {
    code: 'organism-not-full-width',
    severity: 'medium',
    title: `${offenders.length} organism${plural(offenders.length)} that does not span the frame, so it will not behave as a root-level band`,
    fix: 'Set the frame to fill the width, or move it to Molecules. An organism always consumes the full width and sits as a direct child of the page.',
    count: offenders.length,
    examples: offenders
      .map(
        (a) =>
          `${a.name} (${Math.round(a.evidence.width)}px of ${Math.round(a.evidence.frameWidth)}px)`,
      )
      .slice(0, 3),
  }
}

function moleculesFullWidth(all: LayerAssignment[]): DesignFinding | undefined {
  const offenders = all.filter((a) => a.layer === 'molecule' && a.evidence.fullWidth)
  if (offenders.length === 0) return undefined
  return {
    code: 'molecule-full-width',
    severity: 'medium',
    title: `${offenders.length} molecule${plural(offenders.length)} spanning the frame edge to edge, which is the organism test`,
    fix: 'Move them to Organisms, or give them a width that is not the full frame. Molecules are explicitly not edge to edge.',
    count: offenders.length,
    examples: offenders.map((a) => a.name).slice(0, 3),
  }
}

const OWNERSHIP = new Set(['specific', 'private', 'public'])

function unownedComponents(
  all: LayerAssignment[],
  ownership: Record<string, string> | undefined,
  fallback: string | undefined,
): DesignFinding | undefined {
  if (fallback && OWNERSHIP.has(fallback.toLowerCase())) return undefined
  const offenders = all.filter((a) => {
    const owner = ownership?.[a.name] ?? ownership?.[stripPrefix(a.name)]
    return !owner || !OWNERSHIP.has(owner.toLowerCase())
  })
  if (offenders.length === 0) return undefined
  return {
    code: 'unowned-component',
    severity: 'low',
    title: `${offenders.length} component${plural(offenders.length)} with no ownership declared, so nobody can tell whether it is shared or one team's`,
    fix: "Declare each as specific, private or public in design-system.json. Specific and private components stay in the owning team's repo; only public ones belong in the shared package.",
    count: offenders.length,
    examples: offenders.map((a) => a.name).slice(0, 3),
  }
}

const BREAKPOINTISH = /\b(breakpoint|viewport|screen|device|mobile|tablet|desktop|sm|md|lg|xl)\b/i

/**
 * Theme is colours, spacing and breakpoints. The first two are collected
 * already; nothing in the file describes the third, so the generator emits no
 * responsive classes at all — every component is one fixed width.
 */
function missingBreakpoints(nodes: FigmaNode[]): DesignFinding | undefined {
  if (nodes.some((n) => BREAKPOINTISH.test(n.name))) return undefined
  return {
    code: 'no-breakpoints',
    severity: 'low',
    title:
      'No breakpoints anywhere in the file, so the theme has colours and spacing but nothing responsive, and every component is emitted at one fixed width',
    fix: 'Add breakpoint variants (a Size or Breakpoint property with Mobile / Tablet / Desktop) to the components that reflow. Without them a responsive rule would be invented rather than generated.',
    count: 1,
    examples: [],
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ---------------------------------------------------------------------------

const names = (nodes: FigmaNode[], max = 3): string[] =>
  [...new Set(nodes.map((n) => n.name))].slice(0, max)

const plural = (n: number) => (n === 1 ? '' : 's')
