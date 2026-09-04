import type { FigmaNode } from '../figma/types.js'
import { nameOf, type Palette } from './palette.js'

/**
 * Writes down what the **design file** defines, and nothing about what the
 * generator did with it.
 *
 * `tokens.css` and `tokens.json` describe the output; this describes the input.
 * Keeping the two apart is the point: a reader asking "what does the design
 * call this colour, and is it bound?" should not have to read past CSS custom
 * properties to find out, and a token that never reached the output is exactly
 * the case where a document written from the output cannot help.
 *
 * So there are deliberately **no implementation references here** — no custom
 * property names, no mention of the generated stylesheet, no token counts. Add
 * one and this stops being a record of the design.
 */

export interface FigmaTokenDocSource {
  key: string
  node?: string
  lastModified?: string
  version?: string
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

function walk(node: FigmaNode, fn: (n: FigmaNode) => void): void {
  fn(node)
  for (const child of node.children ?? []) walk(child, fn)
}

/** Every Variable bound to a colour anywhere, with the value it renders. */
function boundColours(document: FigmaNode): Map<string, string> {
  const out = new Map<string, string>()
  walk(document, (node) => {
    for (const field of ['fills', 'strokes'] as const) {
      const bound = node.boundVariables?.[field]
      if (!Array.isArray(bound)) continue
      ;(node[field] ?? []).forEach((paint, i) => {
        const alias = bound[i]
        if (!alias || paint.type !== 'SOLID' || paint.visible === false || !paint.color) return
        out.set(alias.id, hex(paint.color).toLowerCase())
      })
    }
  })
  return out
}

/** One colour the design documents, exactly as the file states it. */
export interface FigmaColourToken {
  name: string
  value: string
  group?: string
  order: number
  /** The Variable bound to the swatch, when the swatch is bound. */
  variable?: string
  /** Exported as SVG, so this swatch cannot carry a colour into the IR. */
  flattened: boolean
  /** Every Variable in the file rendering this value. */
  variables: string[]
}

/** The design's token vocabulary, machine-readable. No implementation detail. */
export interface FigmaTokens {
  figma: { key: string; node?: string; lastModified?: string; version?: string }
  palette?: { title?: string; groups: string[] }
  colours: FigmaColourToken[]
  /** Variables bound to a corner radius, and how many corners each covers. */
  radius: { variable: string; boundOn: number }[]
  spacing: { bound: { variable: string; boundOn: number }[]; autoLayoutFrames: number }
  typography: {
    family: string
    weight: number
    size: number
    lineHeight?: number
    sizeBound: boolean
  }[]
}

/**
 * Reads the design's tokens into a structure. The markdown document renders
 * this; a test can assert the generated theme against it. One extraction, so
 * the two can never disagree.
 */
export function collectFigmaTokens(
  document: FigmaNode,
  palette: Palette | undefined,
  source: FigmaTokenDocSource,
): FigmaTokens {
  const bound = boundColours(document)
  const varsFor = (value: string) =>
    [...bound.entries()].filter(([, v]) => v === value).map(([id]) => id)

  const colours: FigmaColourToken[] = (palette?.swatches ?? []).map((swatch) => ({
    name: nameOf(swatch),
    value: swatch.value,
    ...(swatch.group ? { group: swatch.group } : {}),
    order: swatch.index,
    ...(swatch.variable ? { variable: swatch.variable } : {}),
    flattened: swatch.flattened,
    variables: varsFor(swatch.value),
  }))

  const radiusMap = new Map<string, number>()
  walk(document, (node) => {
    const corners = node.boundVariables?.['rectangleCornerRadii']
    if (!corners || Array.isArray(corners)) return
    for (const alias of Object.values(corners as Record<string, { id: string }>))
      radiusMap.set(alias.id, (radiusMap.get(alias.id) ?? 0) + 1)
  })

  const spacingMap = new Map<string, number>()
  let autoLayoutFrames = 0
  walk(document, (node) => {
    if (node.layoutMode && node.layoutMode !== 'NONE') autoLayoutFrames++
    for (const field of SPACING_FIELDS) {
      const alias = node.boundVariables?.[field]
      if (!alias || Array.isArray(alias)) continue
      const id = (alias as { id?: unknown }).id
      if (typeof id === 'string') spacingMap.set(id, (spacingMap.get(id) ?? 0) + 1)
    }
  })

  const typeMap = new Map<string, FigmaTokens['typography'][number]>()
  walk(document, (node) => {
    const style = node.style
    if (!style?.fontFamily) return
    const key = `${style.fontFamily}|${style.fontWeight ?? 400}|${style.fontSize}|${style.lineHeightPx ?? ''}`
    const existing = typeMap.get(key)
    const sizeBound = Boolean(node.boundVariables?.['fontSize'])
    if (existing) existing.sizeBound ||= sizeBound
    else
      typeMap.set(key, {
        family: style.fontFamily,
        weight: style.fontWeight ?? 400,
        size: style.fontSize!,
        ...(style.lineHeightPx ? { lineHeight: Math.round(style.lineHeightPx) } : {}),
        sizeBound,
      })
  })

  return {
    figma: {
      key: source.key,
      ...(source.node ? { node: source.node } : {}),
      ...(source.lastModified ? { lastModified: source.lastModified } : {}),
      ...(source.version ? { version: source.version } : {}),
    },
    ...(palette
      ? {
          palette: {
            ...(palette.title ? { title: palette.title } : {}),
            groups: palette.groups.map((g) => g.name).filter((n): n is string => Boolean(n)),
          },
        }
      : {}),
    colours,
    radius: [...radiusMap].map(([variable, boundOn]) => ({ variable, boundOn })),
    spacing: {
      bound: [...spacingMap].map(([variable, boundOn]) => ({ variable, boundOn })),
      autoLayoutFrames,
    },
    typography: [...typeMap.values()].sort(
      (a, b) => a.family.localeCompare(b.family) || a.weight - b.weight || a.size - b.size,
    ),
  }
}

const SPACING_FIELDS = [
  'itemSpacing',
  'counterAxisSpacing',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
] as const

const row = (cells: string[]) => `| ${cells.join(' | ')} |`

export function emitFigmaTokenDoc(
  document: FigmaNode,
  palette: Palette | undefined,
  source: FigmaTokenDocSource,
): string {
  const lines: string[] = [
    '# Figma tokens',
    '',
    'What the design file defines. Generated by figma2react — do not edit; re-run to update.',
    '',
    'This records the **design**: the names the file shows, the values behind them, and whether',
    'each is bound to a Variable. What was generated from it is recorded elsewhere.',
    '',
    row(['', '']),
    row(['---', '---']),
    row(['File', `\`${source.key}\`${source.node ? `, node \`${source.node}\`` : ''}`]),
  ]
  if (source.lastModified) lines.push(row(['Last modified', source.lastModified]))
  if (source.version) lines.push(row(['Version', `\`${source.version}\``]))

  const bound = boundColours(document)

  // --- colour -------------------------------------------------------------
  lines.push('', '## Colour', '')
  if (palette?.swatches.length) {
    lines.push(
      `The palette documents ${palette.swatches.length} colour(s), in the file's own order.`,
      '',
    )
    let group: string | undefined | null = null
    for (const swatch of palette.swatches) {
      if (swatch.group !== group) {
        group = swatch.group
        lines.push('', `### ${group ?? 'Ungrouped'}`, '')
        lines.push(row(['Name', 'Value', 'Variable', 'Note']))
        lines.push(row(['---', '---', '---', '---']))
      }
      const notes: string[] = []
      if (swatch.flattened) notes.push('flattened to a vector')
      const shared = palette.swatches.filter((s) => s.value === swatch.value)
      if (shared.length > 1)
        notes.push(
          `shares its value with ${shared
            .filter((s) => s !== swatch)
            .map(nameOf)
            .join(', ')}`,
        )
      const holders = [...bound.entries()].filter(([, v]) => v === swatch.value).map(([id]) => id)
      if (holders.length > 1) notes.push(`${holders.length} variables render this value`)
      lines.push(
        row([
          nameOf(swatch),
          `\`${swatch.value}\``,
          swatch.variable ? `\`${swatch.variable}\`` : '_not bound_',
          notes.join('; ') || '',
        ]),
      )
    }
  } else {
    lines.push('The file documents no colour palette.', '')
  }

  // Variables the palette does not account for.
  const documented = new Set((palette?.swatches ?? []).map((s) => s.value))
  const undocumented = [...bound.entries()].filter(([, v]) => !documented.has(v))
  if (undocumented.length) {
    lines.push('', '### Bound but not documented', '')
    lines.push(
      'Bound to a Variable somewhere in the file, but absent from the palette, so the file does',
      'not say what they are for.',
      '',
      row(['Variable', 'Value']),
      row(['---', '---']),
      ...undocumented.map(([id, v]) => row([`\`${id}\``, `\`${v}\``])),
    )
  }

  // --- radius -------------------------------------------------------------
  const radii = new Map<string, number>()
  walk(document, (node) => {
    const corners = node.boundVariables?.['rectangleCornerRadii']
    if (!corners || Array.isArray(corners)) return
    for (const alias of Object.values(corners as Record<string, { id: string }>))
      radii.set(alias.id, (radii.get(alias.id) ?? 0) + 1)
  })
  lines.push('', '## Radius', '')
  if (radii.size) {
    lines.push(row(['Variable', 'Bound on']), row(['---', '---']))
    for (const [id, uses] of radii) lines.push(row([`\`${id}\``, `${uses} corner(s)`]))
  } else {
    lines.push('No corner radius is bound to a Variable.', '')
  }

  // --- spacing ------------------------------------------------------------
  const SPACING = [
    'itemSpacing',
    'counterAxisSpacing',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'paddingBottom',
  ] as const
  const spacing = new Map<string, number>()
  let autoLayout = 0
  walk(document, (node) => {
    if (node.layoutMode && node.layoutMode !== 'NONE') autoLayout++
    for (const field of SPACING) {
      const alias = node.boundVariables?.[field]
      if (!alias || Array.isArray(alias)) continue
      // A spacing field carries a bare alias, never the nested map that
      // `rectangleCornerRadii` uses — so a string `id` is what identifies one.
      const id = (alias as { id?: unknown }).id
      if (typeof id === 'string') spacing.set(id, (spacing.get(id) ?? 0) + 1)
    }
  })
  lines.push('', '## Spacing', '')
  if (spacing.size) {
    lines.push(row(['Variable', 'Bound on']), row(['---', '---']))
    for (const [id, uses] of spacing) lines.push(row([`\`${id}\``, `${uses} value(s)`]))
  } else {
    lines.push(
      `**No spacing is bound to a Variable**, across ${autoLayout} auto-layout frame(s).`,
      '',
      'Defining a spacing scale is not the same as applying it. A frame looks correct in Figma',
      'whether or not its gap references a Variable, so this is invisible from inside the file.',
      '',
    )
  }

  // --- typography ---------------------------------------------------------
  const combos = new Map<string, boolean>()
  walk(document, (node) => {
    const style = node.style
    if (!style?.fontFamily) return
    const key = `${style.fontFamily} | ${style.fontWeight ?? 400} | ${style.fontSize}${
      style.lineHeightPx ? `/${Math.round(style.lineHeightPx)}` : ''
    }`
    combos.set(key, combos.get(key) || Boolean(node.boundVariables?.['fontSize']))
  })
  lines.push('', '## Typography', '')
  if (combos.size) {
    lines.push(
      `${combos.size} distinct combination(s) in use.`,
      '',
      row(['Family', 'Weight', 'Size / line height', 'Size bound']),
      row(['---', '---', '---', '---']),
      ...[...combos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, isBound]) => {
          const [family, weight, size] = key.split(' | ')
          return row([family!, weight!, size!, isBound ? 'yes' : '**no**'])
        }),
    )
  } else {
    lines.push('The file carries no text.', '')
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n'
}
