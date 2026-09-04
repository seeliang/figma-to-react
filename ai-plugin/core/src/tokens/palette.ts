import type { FigmaNode } from '../figma/types.js'

/**
 * Reads a file's own colour documentation — the palette frame — as a source of
 * names for Variables whose names the REST API withholds.
 *
 * `/v1/files/:key/nodes` returns a bound colour as `VariableID:2:38` with no
 * name, and the endpoint that would supply one is Enterprise-only. But a file
 * that documents its palette has already written those names down, next to the
 * colours they belong to. This reads them back.
 *
 * Like {@link ../atomic.ts assignLayers}, it resolves what the design states and
 * **suggests with evidence** where the design is ambiguous — it never picks. A
 * wrong name is worse than an obviously derived one, because it ships on the
 * public API of the theme and nothing downstream can tell it is wrong.
 */

/** Shapes that can carry a swatch's colour. */
const SHAPES = new Set(['ELLIPSE', 'RECTANGLE', 'VECTOR', 'BOOLEAN_OPERATION'])

/**
 * Which frames document colour. Deliberately narrow: a `Radius` or `Spacing`
 * documentation frame has the same cell structure and must not be read as a
 * palette.
 */
const COLOUR_FRAME = /colou?r/i

/** A heading is a text node that labels the row beneath it, not a swatch. */
const HEADING = /^[^a-z]*$/

export interface PaletteSwatch {
  /** The cell layer's own name — usually the role, and the better name. */
  layerName: string
  /** The text the cell displays, when it displays any. */
  label?: string
  /** The heading above this swatch's row, when the palette has headings. */
  group?: string
  /** Document order, so a consumer can present the palette as designed. */
  index: number
  /** `#rrggbb`, lowercase. */
  value: string
  /** The Variable this swatch is bound to. Absent when nobody bound it. */
  variable?: string
  /** A flattened swatch is exported as SVG, so its binding never reaches a token. */
  flattened: boolean
}

/** Why a swatch could not name anything, stated so a person can act on it. */
export interface PaletteAmbiguity {
  value: string
  /** The names competing for this value. */
  names: string[]
  /** The Variables holding this value. */
  variables: string[]
  reason: string
}

export interface Palette {
  /** The documentation frame's own name — what the design calls this palette. */
  title?: string
  /** Every swatch found, in document order. */
  swatches: PaletteSwatch[]
  /** `VariableID:… → name`, only where the join is certain. */
  names: Record<string, string>
  /** `#rrggbb → name`, for colours no Variable binds anywhere. */
  byValue: Record<string, string>
  /** What the palette could not decide, with the evidence. */
  ambiguous: PaletteAmbiguity[]
  /** Headings and their swatch values, in document order. */
  groups: { name?: string; values: string[] }[]
}

const hex = (c: { r: number; g: number; b: number }): string =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

const solidFill = (node: FigmaNode): string | undefined => {
  const fill = (node.fills ?? []).find((f) => f.type === 'SOLID' && f.visible !== false)
  return fill?.color ? hex(fill.color) : undefined
}

const boundFill = (node: FigmaNode): string | undefined => {
  const fills = node.boundVariables?.['fills']
  return Array.isArray(fills) ? fills[0]?.id : undefined
}

/** Depth-first, parents before children. */
function walk(node: FigmaNode, fn: (n: FigmaNode) => void): void {
  fn(node)
  for (const child of node.children ?? []) walk(child, fn)
}

/**
 * A cell is a container holding one coloured shape and at least one label. That
 * pairing is what makes a palette readable by a person, and it is the same thing
 * that makes it readable here.
 */
function readCell(
  node: FigmaNode,
  group: string | undefined,
  index: number,
): PaletteSwatch | undefined {
  const children = node.children ?? []
  const shape = children.find((c) => SHAPES.has(c.type) && solidFill(c))
  if (!shape) return undefined
  const label = children.find((c) => c.type === 'TEXT')?.characters
  const value = solidFill(shape)!
  return {
    layerName: node.name ?? '',
    ...(label ? { label } : {}),
    ...(group ? { group } : {}),
    index,
    value: value.toLowerCase(),
    ...(boundFill(shape) ? { variable: boundFill(shape)! } : {}),
    flattened: shape.type === 'VECTOR' || shape.type === 'BOOLEAN_OPERATION',
  }
}

/**
 * The name to ship for a swatch: **what it displays**, else its layer name.
 *
 * The displayed label is the name the design presents — the one a designer
 * reads, points at and refers to. A layer name is metadata nobody is looking
 * at, so reaching for it would ship a name the design does not show.
 *
 * When the displayed label is poor — `Neutral-0f` says no more than the derived
 * name it replaces — that is a **design issue**, reported so it can be fixed in
 * Figma. Silently substituting a better name found elsewhere in the file would
 * hide it.
 */
export function nameOf(swatch: PaletteSwatch): string {
  return swatch.label || swatch.layerName || ''
}

/**
 * Finds the colour documentation frame and reads it.
 *
 * Returns `undefined` when the file documents no palette — which is not an
 * error. Most files do not, and the generator falls back to derived names.
 */
export function readPalette(document: FigmaNode): Palette | undefined {
  const frames: FigmaNode[] = []
  walk(document, (n) => {
    if (
      (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'GROUP') &&
      COLOUR_FRAME.test(n.name ?? '')
    )
      frames.push(n)
  })
  if (!frames.length) return undefined

  // Several frames may match; the palette is the one documenting the most
  // colours. A `Color` frame holding one swatch is a component, not a palette.
  let best: { frame: FigmaNode; swatches: PaletteSwatch[]; groups: Palette['groups'] } | undefined
  for (const frame of frames) {
    const parsed = parseFrame(frame)
    if (!best || parsed.swatches.length > best.swatches.length)
      best = { frame, swatches: parsed.swatches, groups: parsed.groups }
  }
  if (!best || best.swatches.length < 2) return undefined

  return {
    ...(best.frame.name ? { title: best.frame.name } : {}),
    ...resolve(best.swatches, best.groups, document),
  }
}

/** Walks one frame's direct children, tracking headings as it goes. */
function parseFrame(frame: FigmaNode): { swatches: PaletteSwatch[]; groups: Palette['groups'] } {
  const swatches: PaletteSwatch[] = []
  const groups: Palette['groups'] = []
  let group: string | undefined
  let current: { name?: string; values: string[] } | undefined

  const push = (swatch: PaletteSwatch) => {
    if (!current || current.name !== group) {
      current = { ...(group ? { name: group } : {}), values: [] }
      groups.push(current)
    }
    current.values.push(swatch.value)
    swatches.push(swatch)
  }

  for (const child of frame.children ?? []) {
    // An all-caps text node between rows is a section heading. The frame's own
    // title is a heading too, and simply names the group nothing follows.
    if (child.type === 'TEXT') {
      const text = (child.characters ?? '').trim()
      if (text && HEADING.test(text)) group = text
      continue
    }
    const asCell = readCell(child, group, swatches.length)
    if (asCell) {
      push(asCell)
      continue
    }
    // Otherwise it is a row of cells.
    for (const cell of child.children ?? []) {
      const parsed = readCell(cell, group, swatches.length)
      if (parsed) push(parsed)
    }
  }
  return { swatches, groups }
}

/**
 * Decides which swatches may name something.
 *
 * Two joins, and the second is the one that needs guarding:
 *
 * - **By binding** — the swatch is bound to the Variable it documents, so the
 *   join is by id and cannot be wrong.
 * - **By value** — only when that value appears in exactly one swatch *and* is
 *   held by exactly one Variable in the whole file. Both halves are required:
 *   one label against two Variables would name a focus ring `primary`.
 *
 * Everything else is reported, not guessed.
 */
function resolve(
  swatches: PaletteSwatch[],
  groups: Palette['groups'],
  document: FigmaNode,
): Palette {
  const names: Record<string, string> = {}
  const byValue: Record<string, string> = {}
  const ambiguous: PaletteAmbiguity[] = []

  // Every Variable bound to each value, anywhere in the file — the palette's
  // own swatches included, since a swatch is bound to the variable it documents.
  const varsByValue = new Map<string, Set<string>>()
  walk(document, (node) => {
    for (const field of ['fills', 'strokes'] as const) {
      const paints = node[field] ?? []
      const bound = node.boundVariables?.[field]
      if (!Array.isArray(bound)) continue
      paints.forEach((paint, i) => {
        const alias = bound[i]
        if (!alias || paint.type !== 'SOLID' || paint.visible === false || !paint.color) return
        const value = hex(paint.color).toLowerCase()
        if (!varsByValue.has(value)) varsByValue.set(value, new Set())
        varsByValue.get(value)!.add(alias.id)
      })
    }
  })

  const cellsPerValue = new Map<string, PaletteSwatch[]>()
  for (const swatch of swatches) {
    if (!cellsPerValue.has(swatch.value)) cellsPerValue.set(swatch.value, [])
    cellsPerValue.get(swatch.value)!.push(swatch)
  }

  for (const swatch of swatches) {
    const name = nameOf(swatch)
    if (!name) continue

    // 1. The swatch is bound: the join is by id and cannot be wrong.
    if (swatch.variable) {
      names[swatch.variable] = name
      continue
    }

    // 2. Unbound: the palette still names the **value**, which is a different
    //    claim from naming a *variable*. That a second Variable also renders
    //    this hex does not make the design's own label for the colour wrong —
    //    it makes that Variable undocumented, which is reported separately.
    //    Refusing here is what produced `--color-blue-600` for a colour the
    //    file plainly calls Primary.
    byValue[swatch.value] = byValue[swatch.value] ?? name

    const vars = [...(varsByValue.get(swatch.value) ?? [])]
    // Once per value, not once per swatch that happens to carry it.
    if (vars.length > 1 && !ambiguous.some((a) => a.value === swatch.value)) {
      ambiguous.push({
        value: swatch.value,
        names: [name],
        variables: vars,
        reason:
          `${vars.length} variables render this value, so they share one token — ` +
          'bind each swatch to the Variable it documents to separate them',
      })
    }
  }

  // Several swatches may document one value — `Primary Foreground` and
  // `Background` are both white, and are two design decisions rather than one.
  // They are kept apart, so each becomes its own custom property; only the
  // Variables behind them are indistinguishable, and that is reported.
  for (const [value, cells] of cellsPerValue) {
    if (cells.length < 2) continue
    ambiguous.push({
      value,
      names: cells.map(nameOf),
      variables: [...(varsByValue.get(value) ?? [])],
      reason:
        `${cells.length} swatches document this value; each becomes its own token, but a raw ` +
        'use of the value cannot say which one it meant',
    })
  }

  return { swatches, names, byValue, ambiguous, groups }
}
