import { walk } from '../ir/normalize.js'
import type { IRDocument, IRNode, TokenRef } from '../ir/types.js'
import type { TokenKind, TokenResolver } from './types.js'

export interface Token {
  kind: TokenKind
  /** Theme name without its prefix: `surface-raised`, `blue-600`. */
  name: string
  /** The CSS value this token holds. */
  value: string
  /** Figma style/variable key this token came from, when it had one. */
  source?: TokenRef
  uses: number
}

export interface TokenTable {
  tokens: Token[]
  resolver: TokenResolver
}

export interface CollectOptions {
  /**
   * How many times an *unnamed* colour must appear before it earns a theme
   * entry. One-off colours are better left as literals than as `--color-gray-3`
   * entries nobody will ever reuse.
   */
  minUses?: number
}

interface Candidate {
  kind: TokenKind
  value: string
  numeric?: number
  source?: TokenRef
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
 * frequency: Tailwind's built-in scale already covers them, and inventing
 * `--spacing-7` where `p-7` exists makes the output worse, not better.
 */
export function collectTokens(doc: IRDocument, options: CollectOptions = {}): TokenTable {
  const minUses = options.minUses ?? 3
  const candidates = new Map<string, Candidate>()

  const add = (kind: TokenKind, value: string, source?: TokenRef, numeric?: number) => {
    // Group by the Figma construct when there is one, by value otherwise: two
    // variables that happen to hold the same colour stay two tokens.
    const key = source ? `${kind}:${source.source}:${source.key}` : `${kind}:${value}`
    const existing = candidates.get(key)
    if (existing) {
      existing.uses++
      existing.source ??= source
      return
    }
    candidates.set(key, { kind, value, numeric, source, uses: 1 })
  }

  walk(doc.root, (node) => collectFromNode(node, add))

  const tokens: Token[] = []
  const used = new Set<string>()

  for (const c of [...candidates.values()].sort(byPriority)) {
    const name = nameFor(c, used)
    if (!name) continue
    if (!c.source && (c.kind !== 'color' || c.uses < minUses)) continue
    used.add(`${c.kind}:${name}`)
    tokens.push({ kind: c.kind, name, value: c.value, source: c.source, uses: c.uses })
  }

  return { tokens, resolver: makeResolver(tokens) }
}

function collectFromNode(
  node: IRNode,
  add: (k: TokenKind, v: string, s?: TokenRef, n?: number) => void,
) {
  const { box, text, layout } = node

  if (box.fill?.kind === 'solid') add('color', box.fill.color.css, box.fill.color.token)
  if (box.border) add('color', box.border.color.css, box.border.color.token)
  if (text?.color) add('color', text.color.css, text.color.token)

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
  const rank = (c: Candidate) => (c.source?.name ? 0 : c.source ? 1 : 2)
  return rank(a) - rank(b) || b.uses - a.uses || a.value.localeCompare(b.value)
}

function nameFor(c: Candidate, used: Set<string>): string | undefined {
  const base = c.source?.name ? slugify(c.source.name) : synthesize(c)
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
  const { h, s, l } = toHsl(rgb)

  const family = s < 0.08 ? achromatic(l) : hueFamily(h)
  return family === 'white' || family === 'black' ? family : `${family}-${nearestStep(l)}`
}

/**
 * Lightness of each step on Tailwind's own ramp (measured from its blue scale,
 * which the other hues track closely). A linear 1-l mapping drifts about a full
 * step in the mid-tones, so #2563eb — Tailwind's own blue-600 — would come out
 * named blue-500. Nearest-neighbour against the real ramp keeps the synthesised
 * names recognisable to anyone who knows Tailwind.
 */
const STEP_LIGHTNESS: [number, number][] = [
  [0.969, 50],
  [0.927, 100],
  [0.873, 200],
  [0.784, 300],
  [0.678, 400],
  [0.598, 500],
  [0.533, 600],
  [0.48, 700],
  [0.402, 800],
  [0.329, 900],
  [0.21, 950],
]

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
    if (t.source) bySource.set(`${t.kind}:${t.source.source}:${t.source.key}`, t.name)
    // Only unnamed tokens may be matched by raw value; a value that also has a
    // named token elsewhere must not silently borrow that name.
    if (!t.source && !byValue.has(`${t.kind}:${t.value}`))
      byValue.set(`${t.kind}:${t.value}`, t.name)
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
