import { walk } from '../ir/normalize.js'
import type { IRDocument, IRNode, TokenRef } from '../ir/types.js'
import type { TokenKind, TokenResolver } from './types.js'

export interface Token {
  kind: TokenKind
  /** Theme name without its prefix: `surface-raised`, `blue-600`. */
  name: string
  /** The CSS value this token holds. */
  value: string
  /** Every Figma style/variable that resolves to this token. */
  sources: TokenRef[]
  /**
   * The name the design documented for this colour, where no Style or Variable
   * carried one. A token with a label is named by the design as surely as one
   * with a named source — the name simply arrived from the palette instead.
   */
  label?: string
  uses: number
}

export interface TokenTable {
  tokens: Token[]
  resolver: TokenResolver
  /** Every typeface used, with the exact styles the design draws in. */
  fonts: FontUsage[]
}

export interface FontUsage {
  family: string
  /** Distinct `weight`/`italic` pairs, so only what is used gets requested. */
  styles: { weight: number; italic: boolean }[]
}

export interface CollectOptions {
  /**
   * How many times an *unnamed* colour must appear before it earns a theme
   * entry. One-off colours are better left as literals than as `--color-gray-3`
   * entries nobody will ever reuse.
   */
  minUses?: number
  /**
   * `#rrggbb → name`, from the file's own colour documentation. Names a colour
   * that no Style or Variable carries — the palette still says what it is for.
   */
  colorNames?: Record<string, string>
}

interface Candidate {
  kind: TokenKind
  value: string
  numeric?: number
  /** Named source, if any — the only kind that earns its own token. */
  named?: TokenRef
  /** A name from the file's colour documentation, where no source carries one. */
  label?: string
  /** Every source seen for this candidate, named or not. */
  sources: TokenRef[]
  uses: number
}

/**
 * Walks the IR and decides which style values become theme entries.
 *
 * The naming rules, in priority order:
 *   1. a Figma *style* name (`Surface/Raised` → `surface-raised`) — available
 *      on every plan, so this is the common case for design-system files;
 *   2. a Figma *variable* id — the name needs Enterprise access, but the id is
 *      a correct grouping key, so a synthetic name is assigned and every node
 *      bound to that variable shares it;
 *   3. for colours only, frequency — a colour used {@link CollectOptions.minUses}
 *      times is load-bearing whatever it is called.
 *
 * Spacing, radius, font size and shadow are deliberately *not* named by
 * frequency: a name derived from a measurement (`--spacing-7`) carries no more
 * meaning than the measurement itself, so it is worth a token only when the
 * design binds a Variable and supplies a real name.
 */
export function collectTokens(doc: IRDocument, options: CollectOptions = {}): TokenTable {
  const minUses = options.minUses ?? 3
  const candidates = new Map<string, Candidate>()

  const add = (kind: TokenKind, value: string, source?: TokenRef, numeric?: number) => {
    // Only a *named* source earns its own token. Figma Styles carry names on
    // every plan; Variables do not unless the caller has Enterprise access to
    // the variables endpoint, and an unnameable variable adds no information —
    // grouping three of them under `white`, `white-2`, `white-3` is strictly
    // worse than one `white`, since the output is identical either way.
    const key = source?.name ? `${kind}:${source.source}:${source.key}` : `${kind}:${value}`
    const existing = candidates.get(key)
    if (existing) {
      existing.uses++
      if (source) existing.sources.push(source)
      existing.named ??= source?.name ? source : undefined
      return
    }
    candidates.set(key, {
      kind,
      value,
      numeric,
      named: source?.name ? source : undefined,
      sources: source ? [source] : [],
      uses: 1,
    })
  }

  const fontStyles = new Map<string, Map<string, { weight: number; italic: boolean }>>()
  walk(doc.root, (node) => {
    collectFromNode(node, add)
    const t = node.text
    if (!t?.fontFamily) return
    const styles = fontStyles.get(t.fontFamily.name) ?? new Map()
    const weight = t.fontWeight ?? 400
    const italic = t.italic === true
    styles.set(`${weight}:${italic}`, { weight, italic })
    fontStyles.set(t.fontFamily.name, styles)
  })

  const fonts: FontUsage[] = [...fontStyles.entries()].map(([family, styles]) => ({
    family,
    styles: [...styles.values()].sort(
      (a, b) => Number(a.italic) - Number(b.italic) || a.weight - b.weight,
    ),
  }))

  foldUnnamedIntoNamed(candidates)

  // A colour nothing binds can still be documented. Applied after folding so a
  // documented value that already has a named token keeps that token's name.
  for (const c of candidates.values()) {
    if (c.kind !== 'color' || c.named) continue
    const documented = options.colorNames?.[c.value.toLowerCase()]
    if (documented) c.label = documented
  }

  const tokens: Token[] = []
  const used = new Set<string>()

  for (const c of [...candidates.values()].sort(byPriority)) {
    const name = nameFor(c, used)
    if (!name) continue
    // Binding a value to a Style or Variable is a deliberate design decision,
    // so it earns a token however rarely it is used — even when the name is
    // unreadable and has to be synthesised. Only values bound to nothing at all
    // have to earn their place by frequency.
    // A typeface is never incidental: one use still has to be spelled out
    // somewhere, and a `--font-*` entry is the readable place for it.
    const exempt = c.sources.length > 0 || c.kind === 'fontFamily'
    if (!exempt && (c.kind !== 'color' || c.uses < minUses)) continue
    used.add(`${c.kind}:${name}`)
    tokens.push({
      kind: c.kind,
      name,
      value: c.value,
      sources: c.sources,
      ...(c.label ? { label: c.label } : {}),
      uses: c.uses,
    })
  }

  return { tokens, resolver: makeResolver(tokens), fonts }
}

/**
 * Folds unbound usages of a colour into the named token for that same value.
 *
 * Binding is applied unevenly in practice: a colour is bound on some nodes and
 * left as a raw hex on others. Those raw usages carry no source, so they form a
 * second candidate keyed by value — and the design's one colour would emit two
 * properties, a named one and a derived twin holding the identical value. That
 * breaks the copy in the opposite direction from a merge, and is harder to spot
 * because both names look reasonable.
 *
 * Only folds when **exactly one** named candidate holds the value. Where two
 * do, nothing can say which of them an unbound usage meant, so it is left
 * derived rather than attached to a guess.
 */
function foldUnnamedIntoNamed(candidates: Map<string, Candidate>): void {
  const namedByValue = new Map<string, Candidate[]>()
  for (const c of candidates.values()) {
    if (!c.named) continue
    const key = `${c.kind}:${c.value}`
    if (!namedByValue.has(key)) namedByValue.set(key, [])
    namedByValue.get(key)!.push(c)
  }

  for (const [key, c] of [...candidates.entries()]) {
    if (c.named) continue
    const owners = namedByValue.get(`${c.kind}:${c.value}`)
    if (owners?.length !== 1) continue
    const owner = owners[0]!
    owner.uses += c.uses
    owner.sources.push(...c.sources)
    candidates.delete(key)
  }
}

/**
 * Figma reports only the family Figma itself resolved. A generated stylesheet
 * needs a fallback so the page stays legible before the webfont loads, or if it
 * never does.
 */
export function fontStack(family: string): string {
  const quoted = /\s/.test(family) ? `'${family}'` : family
  return `${quoted}, ui-sans-serif, system-ui, sans-serif`
}

function collectFromNode(
  node: IRNode,
  add: (k: TokenKind, v: string, s?: TokenRef, n?: number) => void,
) {
  const { box, text, layout } = node

  if (box.fill?.kind === 'solid') add('color', box.fill.color.css, box.fill.color.token)
  if (box.border) add('color', box.border.color.css, box.border.color.token)
  if (text?.color) add('color', text.color.css, text.color.token)

  if (text?.fontFamily) {
    add('fontFamily', fontStack(text.fontFamily.name), text.fontFamily.token)
  }

  if (text?.fontSize?.token)
    add('fontSize', `${text.fontSize.px}px`, text.fontSize.token, text.fontSize.px)

  for (const value of [layout.gap, layout.crossGap, ...paddings(layout)]) {
    if (value?.token) add('spacing', `${value.px}px`, value.token, value.px)
  }

  if (box.corners) {
    for (const corner of [
      box.corners.topLeft,
      box.corners.topRight,
      box.corners.bottomRight,
      box.corners.bottomLeft,
    ]) {
      if (corner.token) add('radius', `${corner.px}px`, corner.token, corner.px)
    }
  }
}

const paddings = (layout: IRNode['layout']) =>
  layout.padding
    ? [layout.padding.top, layout.padding.right, layout.padding.bottom, layout.padding.left]
    : []

/** Named tokens win ties over frequency-named ones, then heavier usage wins. */
const byPriority = (a: Candidate, b: Candidate): number => {
  const rank = (c: Candidate) => (c.named ? 0 : 1)
  return rank(a) - rank(b) || b.uses - a.uses || a.value.localeCompare(b.value)
}

function nameFor(c: Candidate, used: Set<string>): string | undefined {
  const base = c.named ? slugify(c.named.name!) : c.label ? slugify(c.label) : synthesize(c)
  if (!base) return undefined

  let name = base
  let n = 2
  while (used.has(`${c.kind}:${name}`)) name = `${base}-${n++}`
  return name
}

/** `Surface/Raised` → `surface-raised`; `Heading / Small` → `heading-small`. */
export function slugify(figmaName: string): string {
  return figmaName
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1-$2')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function synthesize(c: Candidate): string | undefined {
  if (c.kind === 'color') return nameColor(c.value)
  // `Inter, ui-sans-serif, …` -> `inter`
  if (c.kind === 'fontFamily') return slugify(c.value.split(',')[0]!.replace(/'/g, ''))
  if (c.numeric === undefined) return undefined
  return `${c.numeric}`.replace('.', '-')
}

/**
 * Names a colour from its own HSL: `#2663eb` → `blue-600`. Deterministic, so
 * the same colour always gets the same name across runs and across files —
 * which matters when the generated theme is committed and later re-generated.
 */
export function nameColor(css: string): string {
  const rgb = parseCss(css)
  if (!rgb) return 'color'
  const { h, l } = toHsl(rgb)

  const family = familyFor(rgb, h, l)
  return family === 'white' || family === 'black'
    ? family
    : `${family}-${nearestStep(lightness(rgb))}`
}

/**
 * Chroma, not HSL saturation, decides whether a colour is a grey.
 *
 * HSL saturation is misleading at the extremes: #0f172a is a dark slate that
 * anyone would call grey, yet its saturation is 0.47, which would name it
 * `blue-950` and stand it next to a genuinely blue `blue-600` (#2563eb) in the
 * same theme. The distance between the channels is the honest signal, and it
 * separates those two cleanly (0.11 against 0.78).
 */
function familyFor(rgb: { r: number; g: number; b: number }, h: number, l: number): string {
  const chroma = (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)) / 255

  if (chroma < 0.02) return achromatic(l)
  // Channel spread necessarily collapses toward white, so a pale tint that is
  // plainly green (#f0fdf4) carries less chroma than a mid grey. Near white,
  // judge it on a much lower bar or every tint flattens to `gray-50`.
  const threshold = l > 0.85 ? 0.04 : GREY_CHROMA
  if (chroma < threshold) {
    // Conventional grey ramps are tinted rather than pure; match the tint
    // rather than flattening every muted colour to `neutral`.
    if (h >= 180 && h < 260) return 'slate'
    if (h >= 20 && h < 70) return 'stone'
    return 'gray'
  }
  return hueFamily(h)
}

/** Below this channel spread a colour reads as grey. A representative mid
 *  slate (#64748b) sits at 0.15, and a muted brand colour rarely drops this
 *  low. */
const GREY_CHROMA = 0.2

/**
 * CIE L* of each step on a conventional 50–950 ramp, averaged across slate,
 * blue, green, red and amber scales.
 *
 * HSL lightness is not comparable across hues — green-500 and blue-500 differ
 * by 0.15 in HSL-L, enough to name #22c55e as `green-700`. L* is perceptually
 * uniform, so one table serves every hue.
 */
const STEP_LIGHTNESS: [number, number][] = [
  [97.6, 50],
  [94.5, 100],
  [89.6, 200],
  [82.4, 300],
  [71.4, 400],
  [60.3, 500],
  [49.7, 600],
  [40.0, 700],
  [31.3, 800],
  [24.9, 900],
  [12.4, 950],
]

/** CIE L* from sRGB, 0 (black) to 100 (white). */
function lightness({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const n = c / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
  }
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y
}

function nearestStep(l: number): number {
  let best = STEP_LIGHTNESS[0]!
  for (const entry of STEP_LIGHTNESS) {
    if (Math.abs(entry[0] - l) < Math.abs(best[0] - l)) best = entry
  }
  return best[1]
}

const achromatic = (l: number): string => (l >= 0.99 ? 'white' : l <= 0.01 ? 'black' : 'neutral')

const HUES: [number, string][] = [
  [15, 'red'],
  [45, 'orange'],
  [65, 'yellow'],
  [100, 'lime'],
  [150, 'green'],
  [175, 'teal'],
  [195, 'cyan'],
  [225, 'blue'],
  [260, 'indigo'],
  [290, 'violet'],
  [330, 'pink'],
  [360, 'red'],
]

const hueFamily = (h: number): string => HUES.find(([max]) => h < max)?.[1] ?? 'red'

function parseCss(css: string): { r: number; g: number; b: number } | undefined {
  const hex = /^#([0-9a-f]{6})$/i.exec(css)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(css)
  if (rgba) {
    const [r, g, b] = rgba[1]!.split(',').map((p) => Number(p.trim()))
    if (r === undefined || g === undefined || b === undefined) return undefined
    return { r, g, b }
  }
  return undefined
}

function toHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60

  return { h, s, l }
}

function makeResolver(tokens: Token[]): TokenResolver {
  const bySource = new Map<string, string>()
  const byValue = new Map<string, string>()

  for (const t of tokens) {
    for (const source of t.sources) {
      bySource.set(`${t.kind}:${source.source}:${source.key}`, t.name)
    }
    // A value may also be matched literally, so a node the designer forgot to
    // bind still resolves to the same token rather than emitting a raw hex.
    if (!byValue.has(`${t.kind}:${t.value}`)) byValue.set(`${t.kind}:${t.value}`, t.name)
  }

  return {
    resolve(kind, value, token) {
      if (token) {
        const hit = bySource.get(`${kind}:${token.source}:${token.key}`)
        if (hit) return hit
      }
      const literal = typeof value === 'number' ? `${value}px` : value
      return byValue.get(`${kind}:${literal}`)
    },
  }
}
