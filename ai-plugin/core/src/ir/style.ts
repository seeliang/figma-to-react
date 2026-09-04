import type {
  BoundVariables,
  Color,
  Effect,
  FigmaNode,
  Paint,
  StyleMeta,
  TypeStyle,
  VariableAlias,
} from '../figma/types.js'
import type {
  Border,
  BoxStyle,
  ColorValue,
  Corners,
  Fill,
  LengthValue,
  Shadow,
  TextStyle,
  TokenRef,
} from './types.js'

/** Lookup tables carried through normalization, from the file-nodes response. */
export interface StyleContext {
  styles: Record<string, StyleMeta>
  /**
   * `VariableID:… → name`, from whatever could name them — the REST API cannot.
   * A name here is what stops two Variables sharing a value from collapsing
   * into one token, since {@link ../tokens/collect.ts collectTokens} keys a
   * named source by id and an unnamed one by value.
   */
  variables: Record<string, string>
}

// ---------------------------------------------------------------------------
// colour
// ---------------------------------------------------------------------------

/** Figma stores channels as 0–1 floats. Alpha may also arrive via paint opacity. */
export function colorToCss(c: Color, extraOpacity = 1): string {
  const to255 = (n: number) => Math.round(clamp01(n) * 255)
  const a = round(clamp01(c.a) * clamp01(extraOpacity), 4)
  const [r, g, b] = [to255(c.r), to255(c.g), to255(c.b)]
  if (a >= 1) return `#${hex(r)}${hex(g)}${hex(b)}`
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const hex = (n: number) => n.toString(16).padStart(2, '0')
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const round = (n: number, places = 2) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

// ---------------------------------------------------------------------------
// token references
// ---------------------------------------------------------------------------

/**
 * Resolve a token for a node field, preferring a named style over a bare
 * variable id. `styleField` names the key in the node's `styles` map (`fill`,
 * `text`, `effect`, `stroke`); `varField` names the key in `boundVariables`.
 */
export function tokenFor(
  node: FigmaNode,
  ctx: StyleContext,
  styleField: string,
  varField?: string,
): TokenRef | undefined {
  const styleId = node.styles?.[styleField]
  if (styleId) {
    const meta = ctx.styles[styleId]
    return { source: 'style', key: styleId, name: meta?.name }
  }
  if (varField) {
    const ref = firstAlias(node.boundVariables, varField)
    if (ref) return { source: 'variable', key: ref, ...named(ctx, ref) }
  }
  return undefined
}

/** A variable's name, when anything could supply one. */
const named = (ctx: StyleContext, id: string): { name?: string } => {
  const name = ctx.variables[id]
  return name ? { name } : {}
}

/**
 * A variable reference for one field, ignoring Styles entirely.
 *
 * Font family must not fall back to the node's text style: a Figma text style
 * bundles family, size, weight and line height under one name, so borrowing it
 * for the family alone yields one typeface token per style — `--font-heading-small`
 * and `--font-body` holding the same family.
 */
export function variableRef(
  node: FigmaNode,
  ctx: StyleContext,
  field: string,
): TokenRef | undefined {
  const id = firstAlias(node.boundVariables, field)
  return id ? { source: 'variable', key: id, ...named(ctx, id) } : undefined
}

/**
 * `field` may address an array (`fills`), a bare alias (`color`), or one key of
 * a nested map (`rectangleCornerRadii.RECTANGLE_TOP_LEFT_CORNER_RADIUS`, given
 * here as `rectangleCornerRadii/RECTANGLE_...`).
 */
function firstAlias(bound: BoundVariables | undefined, field: string): string | undefined {
  const [head, nested] = field.split('/')
  const entry = bound?.[head!]
  if (!entry) return undefined
  if (Array.isArray(entry)) return entry[0]?.id
  if (nested) return (entry as Record<string, VariableAlias>)[nested]?.id
  return (entry as VariableAlias).id
}

export function length(
  px: number,
  ctx: StyleContext,
  node?: FigmaNode,
  varField?: string,
): LengthValue {
  const token = varField ? firstAlias(node?.boundVariables, varField) : undefined
  return token
    ? { px: round(px), token: { source: 'variable', key: token, ...named(ctx, token) } }
    : { px: round(px) }
}

// ---------------------------------------------------------------------------
// paint
// ---------------------------------------------------------------------------

const visiblePaints = (paints: Paint[] | undefined): Paint[] =>
  (paints ?? []).filter((p) => p.visible !== false && (p.opacity ?? 1) > 0)

/**
 * Figma layers stack paints bottom-to-top and support many at once; CSS
 * backgrounds do not map cleanly, so we take the topmost visible paint. Losing
 * stacked paints is the documented trade-off — `inspect` surfaces the full node
 * when a design actually relies on them.
 */
export function toFill(node: FigmaNode, ctx: StyleContext): Fill | undefined {
  const paints = visiblePaints(node.fills)
  const paint = paints[paints.length - 1]
  if (!paint) return undefined
  return paintToFill(paint, tokenFor(node, ctx, 'fill', 'fills'))
}

function paintToFill(paint: Paint, token?: TokenRef): Fill | undefined {
  switch (paint.type) {
    case 'SOLID': {
      if (!paint.color) return undefined
      const color: ColorValue = { css: colorToCss(paint.color, paint.opacity ?? 1) }
      if (token) color.token = token
      return { kind: 'solid', color }
    }
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND':
      return { kind: 'gradient', css: gradientToCss(paint) }
    case 'IMAGE':
      return paint.imageRef
        ? { kind: 'image', imageRef: paint.imageRef, scaleMode: scaleMode(paint.scaleMode) }
        : undefined
    default:
      return undefined
  }
}

const scaleMode = (m: Paint['scaleMode']): 'cover' | 'contain' | 'repeat' | 'fill' =>
  m === 'FIT' ? 'contain' : m === 'TILE' ? 'repeat' : m === 'STRETCH' ? 'fill' : 'cover'

/**
 * Figma expresses gradient direction as two handle positions in normalized
 * layer space. CSS wants an angle, so derive it from the handle vector.
 * Radial/angular/diamond gradients degrade to their CSS nearest neighbour.
 */
export function gradientToCss(paint: Paint): string {
  const stops = (paint.gradientStops ?? [])
    .map((s) => `${colorToCss(s.color, paint.opacity ?? 1)} ${round(s.position * 100, 2)}%`)
    .join(', ')

  if (paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_DIAMOND') {
    return `radial-gradient(${stops})`
  }
  if (paint.type === 'GRADIENT_ANGULAR') {
    return `conic-gradient(${stops})`
  }

  const [start, end] = paint.gradientHandlePositions ?? []
  // CSS gradient angles run clockwise from "to top"; Figma's y axis points down.
  const angle =
    start && end ? round((Math.atan2(end.x - start.x, -(end.y - start.y)) * 180) / Math.PI, 1) : 180
  return `linear-gradient(${angle}deg, ${stops})`
}

// ---------------------------------------------------------------------------
// border, corners, effects
// ---------------------------------------------------------------------------

export function toBorder(node: FigmaNode, ctx: StyleContext): Border | undefined {
  const strokes = visiblePaints(node.strokes)
  const stroke = strokes[strokes.length - 1]
  if (!stroke || stroke.type !== 'SOLID' || !stroke.color) return undefined

  const per = node.individualStrokeWeights
  const width = node.strokeWeight ?? (per ? Math.max(per.top, per.right, per.bottom, per.left) : 1)
  if (width <= 0 && !per) return undefined

  const color: ColorValue = { css: colorToCss(stroke.color, stroke.opacity ?? 1) }
  const token = tokenFor(node, ctx, 'stroke', 'strokes')
  if (token) color.token = token

  const border: Border = {
    width: round(width),
    color,
    style: node.strokeDashes && node.strokeDashes.length > 0 ? 'dashed' : 'solid',
  }
  if (per && new Set([per.top, per.right, per.bottom, per.left]).size > 1) {
    border.sides = per
  }
  return border
}

export function toCorners(node: FigmaNode, ctx: StyleContext): Corners | undefined {
  const radii = node.rectangleCornerRadii
  if (radii && new Set(radii).size > 1) {
    const [tl, tr, br, bl] = radii
    return {
      topLeft: length(tl, ctx, node, CORNER_FIELDS.topLeft),
      topRight: length(tr, ctx, node, CORNER_FIELDS.topRight),
      bottomRight: length(br, ctx, node, CORNER_FIELDS.bottomRight),
      bottomLeft: length(bl, ctx, node, CORNER_FIELDS.bottomLeft),
    }
  }
  const r = node.cornerRadius ?? radii?.[0]
  if (!r) return undefined
  const v = length(r, ctx, node, CORNER_FIELDS.topLeft)
  return { topLeft: v, topRight: v, bottomRight: v, bottomLeft: v }
}

/** Where the API actually puts each corner's binding. */
const CORNER_FIELDS = {
  topLeft: 'rectangleCornerRadii/RECTANGLE_TOP_LEFT_CORNER_RADIUS',
  topRight: 'rectangleCornerRadii/RECTANGLE_TOP_RIGHT_CORNER_RADIUS',
  bottomRight: 'rectangleCornerRadii/RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS',
  bottomLeft: 'rectangleCornerRadii/RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS',
} as const

export function toShadows(node: FigmaNode): Shadow[] {
  return (node.effects ?? [])
    .filter((e) => e.visible !== false)
    .filter(
      (e): e is Effect & { type: 'DROP_SHADOW' | 'INNER_SHADOW' } =>
        e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW',
    )
    .map((e) => ({
      inset: e.type === 'INNER_SHADOW',
      x: round(e.offset?.x ?? 0),
      y: round(e.offset?.y ?? 0),
      blur: round(e.radius ?? 0),
      spread: round(e.spread ?? 0),
      color: { css: e.color ? colorToCss(e.color) : 'rgba(0, 0, 0, 0.25)' },
    }))
}

function blurOf(node: FigmaNode, type: 'LAYER_BLUR' | 'BACKGROUND_BLUR'): number | undefined {
  const e = (node.effects ?? []).find((x) => x.type === type && x.visible !== false)
  return e?.radius ? round(e.radius) : undefined
}

export function toBoxStyle(node: FigmaNode, ctx: StyleContext): BoxStyle {
  const box: BoxStyle = {
    shadows: toShadows(node),
    clip: node.clipsContent === true,
  }
  if (node.type === 'ELLIPSE') box.shape = 'ellipse'
  const fill = toFill(node, ctx)
  if (fill) box.fill = fill
  const border = toBorder(node, ctx)
  if (border) box.border = border
  const corners = toCorners(node, ctx)
  if (corners) box.corners = corners
  if (node.opacity !== undefined && node.opacity < 1) box.opacity = round(node.opacity, 3)
  const backdrop = blurOf(node, 'BACKGROUND_BLUR')
  if (backdrop) box.backdropBlur = backdrop
  const blur = blurOf(node, 'LAYER_BLUR')
  if (blur) box.blur = blur
  return box
}

// ---------------------------------------------------------------------------
// text
// ---------------------------------------------------------------------------

export function toTextStyle(node: FigmaNode, ctx: StyleContext): TextStyle | undefined {
  const s: TypeStyle | undefined = node.style
  const fill = toFill(node, ctx)
  if (!s && !fill) return undefined

  const out: TextStyle = {}
  if (s?.fontFamily) {
    const token = variableRef(node, ctx, 'fontFamily')
    out.fontFamily = token ? { name: s.fontFamily, token } : { name: s.fontFamily }
  }
  if (s?.fontSize !== undefined) out.fontSize = length(s.fontSize, ctx, node, 'fontSize')
  if (s?.fontWeight !== undefined) out.fontWeight = s.fontWeight
  if (s?.italic) out.italic = true

  const lh = resolveLineHeight(s)
  if (lh !== undefined) out.lineHeightPx = lh
  if (s?.letterSpacing) out.letterSpacing = round(s.letterSpacing, 3)

  if (s?.textAlignHorizontal && s.textAlignHorizontal !== 'LEFT') {
    out.align =
      s.textAlignHorizontal === 'JUSTIFIED'
        ? 'justify'
        : (s.textAlignHorizontal.toLowerCase() as 'center' | 'right')
  }
  if (s?.textCase && s.textCase !== 'ORIGINAL') {
    out.transform =
      s.textCase === 'UPPER' ? 'uppercase' : s.textCase === 'LOWER' ? 'lowercase' : 'capitalize'
  }
  if (s?.textDecoration && s.textDecoration !== 'NONE') {
    out.decoration = s.textDecoration === 'UNDERLINE' ? 'underline' : 'line-through'
  }

  // Text colour is the node's fill; a gradient or image fill on text is rare
  // enough that we drop it rather than emit background-clip machinery.
  if (fill?.kind === 'solid') {
    const textToken = tokenFor(node, ctx, 'text')
    out.color = textToken ? { ...fill.color, token: fill.color.token ?? textToken } : fill.color
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Figma reports line height as pixels, as a percentage of font size, or as
 * "intrinsic" (meaning: whatever the font says). Normalize to pixels where we
 * can and leave it unset otherwise, so the emitter falls back to `normal`.
 */
function resolveLineHeight(s: TypeStyle | undefined): number | undefined {
  if (!s) return undefined
  // `INTRINSIC_%` is Figma's "Auto" line height. Both Figma and the browser
  // then defer to the font, but they resolve it differently — roughly 3px per
  // line here — and in a stacked column that error accumulates into tens of
  // pixels of drift. Figma still reports the value it computed, so use it.
  if (s.lineHeightPx !== undefined) return round(s.lineHeightPx)
  if (s.lineHeightPercentFontSize !== undefined && s.fontSize !== undefined) {
    return round((s.lineHeightPercentFontSize / 100) * s.fontSize)
  }
  return undefined
}
