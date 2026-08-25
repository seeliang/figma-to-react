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
}

export function auditDesign({ document }: AuditInput): DesignFinding[] {
  const nodes: FigmaNode[] = []
  const collect = (n: FigmaNode) => {
    if (n.visible === false) return
    nodes.push(n)
    n.children?.forEach(collect)
  }
  collect(document)

  const findings = [
    unboundColours(nodes),
    unboundFontSizes(nodes),
    missingAutoLayout(nodes),
    inconsistentVariantSizes(nodes),
    missingInteractiveStates(nodes),
    autoNamedText(nodes),
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

// ---------------------------------------------------------------------------

const names = (nodes: FigmaNode[], max = 3): string[] =>
  [...new Set(nodes.map((n) => n.name))].slice(0, max)

const plural = (n: number) => (n === 1 ? '' : 's')
