import type {
  BoxStyle,
  IRNode,
  Layout,
  LengthValue,
  Shadow,
  Sizing,
  TextStyle,
  TokenRef,
} from '@figma-to-react/core'
import type { TokenResolver } from '@figma-to-react/core'

/** Tailwind's default spacing step: `p-4` is `1rem` is `16px`. */
const SPACING_STEP = 4

export interface ClassContext {
  resolver: TokenResolver
  /** The parent's layout, which decides whether `fill` means `flex-1` or `w-full`. */
  parent?: Layout
}

/**
 * Emits classes in a fixed order — layout, sizing, spacing, colour, typography,
 * effects — so snapshots stay stable and diffs stay readable. Tailwind itself
 * does not care about order, but humans reading the output do.
 */
export function classesFor(node: IRNode, ctx: ClassContext): string {
  const out: string[] = []
  out.push(...layoutClasses(node, ctx))
  out.push(...sizingClasses(node.layout, ctx))
  out.push(...spacingClasses(node.layout, ctx))
  out.push(...boxClasses(node.box, ctx))
  if (node.text) out.push(...textClasses(node.text, ctx))
  out.push(...effectClasses(node.box))
  return out.join(' ')
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------

function layoutClasses(node: IRNode, ctx: ClassContext): string[] {
  const layout = node.layout
  const out: string[] = []

  // Only a node that actually holds absolutely positioned children needs to be
  // their containing block. Emitting `relative` on every leaf is pure noise.
  if (layout.mode === 'none' && node.children.some((c) => c.layout.position)) {
    out.push('relative')
  }

  if (layout.mode === 'flex') {
    out.push('flex')
    // `flex-row` is Tailwind's default; emitting it is noise.
    if (layout.direction === 'column') out.push('flex-col')
    if (layout.wrap) out.push('flex-wrap')
    if (layout.justify) out.push(`justify-${JUSTIFY[layout.justify]}`)
    if (layout.align) out.push(`items-${layout.align}`)
    if (layout.gap) out.push(spacing('gap', layout.gap, ctx))
    if (layout.crossGap) out.push(spacing('gap-y', layout.crossGap, ctx))
  }

  if (ctx.parent?.mode === 'none' && layout.position) {
    out.push(
      'absolute',
      arbitraryPx('left', layout.position.x),
      arbitraryPx('top', layout.position.y),
    )
  }

  if (layout.alignSelf) out.push(`self-${layout.alignSelf}`)

  return out
}

const JUSTIFY = { start: 'start', center: 'center', end: 'end', between: 'between' } as const

// ---------------------------------------------------------------------------
// sizing
// ---------------------------------------------------------------------------

function sizingClasses(layout: Layout, ctx: ClassContext): string[] {
  const out: string[] = []
  const parentAxis = ctx.parent?.mode === 'flex' ? (ctx.parent.direction ?? 'row') : undefined

  const width = sizeClass(layout.width, 'w', parentAxis === 'row', layout, ctx)
  if (width) out.push(...width)
  const height = sizeClass(layout.height, 'h', parentAxis === 'column', layout, ctx)
  if (height) out.push(...height)

  return out
}

/**
 * `fill` means two different things depending on the axis:
 *   - along the parent's main axis it is flex growth (`flex-1`)
 *   - across it, it is a full-size stretch (`w-full` / `h-full`)
 * `hug` is the browser's default for a flex container, so it emits nothing —
 * except for absolutely positioned nodes, which need an explicit `w-fit`.
 */
function sizeClass(
  size: Sizing,
  prefix: 'w' | 'h',
  isMainAxis: boolean,
  layout: Layout,
  ctx: ClassContext,
): string[] | undefined {
  switch (size.kind) {
    case 'fixed':
      return [dimension(prefix, size.px, ctx)]
    case 'fill':
      return isMainAxis ? ['flex-1'] : [`${prefix}-full`]
    case 'hug':
      return ctx.parent?.mode === 'none' && layout.position ? [`${prefix}-fit`] : undefined
  }
}

function dimension(prefix: 'w' | 'h', px: number, ctx: ClassContext): string {
  const token = ctx.resolver.resolve('spacing', px)
  if (token) return `${prefix}-${token}`
  const step = onScale(px)
  return step !== undefined ? `${prefix}-${step}` : arbitraryPx(prefix, px)
}

// ---------------------------------------------------------------------------
// spacing
// ---------------------------------------------------------------------------

function spacingClasses(layout: Layout, ctx: ClassContext): string[] {
  const p = layout.padding
  if (!p) return []

  const [t, r, b, l] = [p.top, p.right, p.bottom, p.left]
  // Collapse to the shortest form that says the same thing.
  if (same(t, r, b, l)) return t.px ? [spacing('p', t, ctx)] : []

  const out: string[] = []
  if (same(t, b) && same(r, l)) {
    if (t.px) out.push(spacing('py', t, ctx))
    if (r.px) out.push(spacing('px', r, ctx))
    return out
  }

  if (same(r, l)) {
    if (r.px) out.push(spacing('px', r, ctx))
  } else {
    if (l.px) out.push(spacing('pl', l, ctx))
    if (r.px) out.push(spacing('pr', r, ctx))
  }
  if (same(t, b)) {
    if (t.px) out.push(spacing('py', t, ctx))
  } else {
    if (t.px) out.push(spacing('pt', t, ctx))
    if (b.px) out.push(spacing('pb', b, ctx))
  }
  return out
}

const same = (...vs: LengthValue[]): boolean =>
  vs.every((v) => v.px === vs[0]!.px && v.token?.key === vs[0]!.token?.key)

function spacing(prefix: string, value: LengthValue, ctx: ClassContext): string {
  const token = ctx.resolver.resolve('spacing', value.px, value.token)
  if (token) return `${prefix}-${token}`
  const step = onScale(value.px)
  return step !== undefined ? `${prefix}-${step}` : arbitraryPx(prefix, value.px)
}

/** Whole steps on Tailwind's 4px scale become `p-4`; anything else stays literal. */
function onScale(px: number): number | undefined {
  if (px === 0) return 0
  const step = px / SPACING_STEP
  return Number.isInteger(step) && step > 0 && step <= 96 ? step : undefined
}

const arbitraryPx = (prefix: string, px: number) => `${prefix}-[${trim(px)}px]`

// ---------------------------------------------------------------------------
// box
// ---------------------------------------------------------------------------

function boxClasses(box: BoxStyle, ctx: ClassContext): string[] {
  const out: string[] = []

  if (box.fill?.kind === 'solid')
    out.push(color('bg', box.fill.color.css, box.fill.color.token, ctx))
  if (box.fill?.kind === 'gradient') out.push(`bg-[${box.fill.css.replace(/\s+/g, '_')}]`)
  // Image fills are rendered as an <img> or a background by the emitter, not here.

  if (box.border) {
    out.push(...borderClasses(box, ctx))
  }

  if (box.corners) out.push(...cornerClasses(box, ctx))
  if (box.clip) out.push('overflow-hidden')
  if (box.opacity !== undefined) out.push(`opacity-${Math.round(box.opacity * 100)}`)

  return out
}

function borderClasses(box: BoxStyle, ctx: ClassContext): string[] {
  const border = box.border!
  const out: string[] = []

  if (border.sides) {
    const { top, right, bottom, left } = border.sides
    if (top) out.push(`border-t-[${trim(top)}px]`)
    if (right) out.push(`border-r-[${trim(right)}px]`)
    if (bottom) out.push(`border-b-[${trim(bottom)}px]`)
    if (left) out.push(`border-l-[${trim(left)}px]`)
  } else {
    // `border` already means 1px; anything else needs the width spelled out.
    out.push(border.width === 1 ? 'border' : `border-[${trim(border.width)}px]`)
  }

  if (border.style === 'dashed') out.push('border-dashed')
  out.push(color('border', border.color.css, border.color.token, ctx))
  return out
}

function cornerClasses(box: BoxStyle, ctx: ClassContext): string[] {
  const c = box.corners!
  const uniform =
    c.topLeft.px === c.topRight.px &&
    c.topRight.px === c.bottomRight.px &&
    c.bottomRight.px === c.bottomLeft.px

  if (uniform) {
    return c.topLeft.px ? [radius('rounded', c.topLeft, ctx)] : []
  }

  const out: string[] = []
  if (c.topLeft.px) out.push(radius('rounded-tl', c.topLeft, ctx))
  if (c.topRight.px) out.push(radius('rounded-tr', c.topRight, ctx))
  if (c.bottomRight.px) out.push(radius('rounded-br', c.bottomRight, ctx))
  if (c.bottomLeft.px) out.push(radius('rounded-bl', c.bottomLeft, ctx))
  return out
}

function radius(prefix: string, value: LengthValue, ctx: ClassContext): string {
  const token = ctx.resolver.resolve('radius', value.px, value.token)
  if (token) return `${prefix}-${token}`
  // A radius at or past half the smallest plausible side reads as a pill.
  if (value.px >= 9999) return `${prefix}-full`
  const named = RADIUS_SCALE[value.px]
  return named !== undefined
    ? named
      ? `${prefix}-${named}`
      : prefix
    : `${prefix}-[${trim(value.px)}px]`
}

/** Tailwind v4's default radius scale, keyed by px. `''` means the bare `rounded`. */
const RADIUS_SCALE: Record<number, string> = {
  2: 'xs',
  4: 'sm',
  6: 'md',
  8: 'lg',
  12: 'xl',
  16: '2xl',
  24: '3xl',
}

// ---------------------------------------------------------------------------
// typography
// ---------------------------------------------------------------------------

function textClasses(text: TextStyle, ctx: ClassContext): string[] {
  const out: string[] = []

  if (text.fontSize) {
    const token = ctx.resolver.resolve('fontSize', text.fontSize.px, text.fontSize.token)
    out.push(token ? `text-${token}` : `text-[${trim(text.fontSize.px)}px]`)
  }
  if (text.lineHeightPx !== undefined) out.push(`leading-[${trim(text.lineHeightPx)}px]`)
  if (text.fontWeight !== undefined && text.fontWeight !== 400) {
    const named = WEIGHTS[text.fontWeight]
    out.push(named ? `font-${named}` : `font-[${text.fontWeight}]`)
  }
  if (text.italic) out.push('italic')
  if (text.letterSpacing) out.push(`tracking-[${trim(text.letterSpacing, 3)}px]`)
  if (text.align) out.push(`text-${text.align}`)
  if (text.transform) out.push(text.transform)
  if (text.decoration) out.push(text.decoration === 'underline' ? 'underline' : 'line-through')
  if (text.color) out.push(color('text', text.color.css, text.color.token, ctx))

  return out
}

const WEIGHTS: Record<number, string> = {
  100: 'thin',
  200: 'extralight',
  300: 'light',
  400: 'normal',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
  800: 'extrabold',
  900: 'black',
}

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

function effectClasses(box: BoxStyle): string[] {
  const out: string[] = []
  if (box.shadows.length > 0) out.push(`shadow-[${box.shadows.map(shadowCss).join(',')}]`)
  if (box.backdropBlur) out.push(`backdrop-blur-[${trim(box.backdropBlur)}px]`)
  if (box.blur) out.push(`blur-[${trim(box.blur)}px]`)
  return out
}

/** Tailwind arbitrary values cannot contain spaces; underscores stand in. */
const shadowCss = (s: Shadow): string =>
  [
    s.inset ? 'inset' : '',
    `${trim(s.x)}px`,
    `${trim(s.y)}px`,
    `${trim(s.blur)}px`,
    `${trim(s.spread)}px`,
    s.color.css,
  ]
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '')

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------

function color(
  prefix: string,
  css: string,
  token: TokenRef | undefined,
  ctx: ClassContext,
): string {
  const name = ctx.resolver.resolve('color', css, token)
  return name ? `${prefix}-${name}` : `${prefix}-[${css.replace(/\s+/g, '')}]`
}

const trim = (n: number, places = 2): string => String(Math.round(n * 10 ** places) / 10 ** places)
