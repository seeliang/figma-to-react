/**
 * The intermediate representation.
 *
 * Deliberately framework-independent: nothing here mentions React, JSX or CSS.
 * An emitter for another framework is a new package consuming these types, not
 * a rewrite of the normalizer.
 *
 * Every style value that could plausibly be a design token is wrapped so it
 * carries both a literal and an optional {@link TokenRef}. That dual form is
 * what lets the token pass rewrite literals into theme keys without walking
 * the tree a second time.
 */

/**
 * A pointer back to the Figma construct a value came from.
 *
 * `style` refs resolve to a human name on every plan (the file-nodes response
 * ships a `styles` map). `variable` refs only carry an id unless the caller has
 * Enterprise access to `/v1/files/:key/variables/local` — but the id alone is
 * still a correct grouping key, so a synthetic name can be assigned later and
 * every node bound to that variable will share it.
 */
export interface TokenRef {
  source: 'style' | 'variable'
  key: string
  name?: string
}

export interface ColorValue {
  /** Ready-to-use CSS colour: `#rrggbb`, or `rgba(...)` when alpha < 1. */
  css: string
  token?: TokenRef
}

export interface LengthValue {
  px: number
  token?: TokenRef
}

export interface FontFamilyValue {
  /** The family name as Figma reports it, e.g. `Inter`. */
  name: string
  token?: TokenRef
}

export type Fill =
  | { kind: 'solid'; color: ColorValue }
  | { kind: 'gradient'; css: string }
  | { kind: 'image'; imageRef: string; scaleMode: 'cover' | 'contain' | 'repeat' | 'fill' }

export interface Shadow {
  inset: boolean
  x: number
  y: number
  blur: number
  spread: number
  color: ColorValue
}

export interface Border {
  width: number
  color: ColorValue
  style: 'solid' | 'dashed'
  /** Present only when per-side weights differ. */
  sides?: { top: number; right: number; bottom: number; left: number }
}

export interface Corners {
  topLeft: LengthValue
  topRight: LengthValue
  bottomRight: LengthValue
  bottomLeft: LengthValue
}

/**
 * `px` is the size Figma measured, carried on every variant rather than only on
 * `fixed`. A hugging node normally needs no width class, but a replaced element
 * such as `<input>` sizes itself and ignores its content, so the measurement is
 * the only way to keep the surrounding layout honest.
 */
export type Sizing =
  { kind: 'fixed'; px: number } | { kind: 'hug'; px?: number } | { kind: 'fill'; px?: number }

export interface Padding {
  top: LengthValue
  right: LengthValue
  bottom: LengthValue
  left: LengthValue
}

export interface Layout {
  /**
   * `flex` for Auto Layout frames. `none` means Figma gave us no layout intent,
   * so children fall back to absolute positioning off their bounding boxes.
   */
  mode: 'flex' | 'none'
  direction?: 'row' | 'column'
  wrap: boolean
  gap?: LengthValue
  /** Row gap when wrapping; Figma's `counterAxisSpacing`. */
  crossGap?: LengthValue
  padding?: Padding
  justify?: 'start' | 'center' | 'end' | 'between'
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
  width: Sizing
  height: Sizing
  /** Offset from the parent's origin; only meaningful when the parent is `none`. */
  position?: { x: number; y: number }
  /** True when this child should expand along its parent's main axis. */
  grow: boolean
  /** Per-child cross-axis override (Figma `layoutAlign: STRETCH`). */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
}

export interface BoxStyle {
  /**
   * Figma expresses a circle through the node *type*, not a corner radius, so
   * an ELLIPSE carries no `cornerRadius` at all and would otherwise render as
   * a square.
   */
  shape?: 'ellipse'
  fill?: Fill
  border?: Border
  corners?: Corners
  shadows: Shadow[]
  /** Only set when < 1. */
  opacity?: number
  clip: boolean
  backdropBlur?: number
  blur?: number
}

export interface TextStyle {
  fontFamily?: FontFamilyValue
  fontSize?: LengthValue
  fontWeight?: number
  italic?: boolean
  /** Absolute line height in px; Figma reports percentages resolved already. */
  lineHeightPx?: number
  letterSpacing?: number
  align?: 'left' | 'center' | 'right' | 'justify'
  transform?: 'uppercase' | 'lowercase' | 'capitalize'
  decoration?: 'underline' | 'line-through'
  color?: ColorValue
}

/**
 * `component` is a component *definition* found in the file; `instance` is a use
 * of one. Both emit as a tag at their position in the tree, and both resolve
 * through `IRNode.component.id`.
 */
export type IRKind = 'box' | 'text' | 'image' | 'vector' | 'instance' | 'component'

export interface IRAsset {
  kind: 'svg' | 'image'
  /** Figma node id (svg) or `imageRef` (raster). Resolved to a file by the asset pass. */
  ref: string
  /** Filled in once the asset has been downloaded and written to disk. */
  fileName?: string
  /** Inline SVG markup, when the asset pass inlined it rather than writing a file. */
  svg?: string
}

export interface IRNode {
  id: string
  /** The raw Figma layer name, untouched. Naming decisions belong to the emitter. */
  name: string
  kind: IRKind
  layout: Layout
  box: BoxStyle
  text?: TextStyle
  /** Text content for `kind: 'text'`. */
  content?: string
  asset?: IRAsset
  /**
   * For `kind: 'instance'` and `kind: 'component'`.
   *
   * `set` and `variant` are kept apart from `name` because consumers need them
   * separately: a Storybook title is the set, the story export is the variant.
   * `name` stays the flattened form, which is what the file is named after.
   */
  component?: {
    id: string
    /** `Input Field Default` — set and variant joined. */
    name: string
    /** `Input Field`, when the component belongs to a variant set. */
    set?: string
    /** `Default`, when the component belongs to a variant set. */
    variant?: string
  }
  children: IRNode[]
}

/** The result of normalizing one Figma subtree. */
export interface IRDocument {
  root: IRNode
  /** Figma file key, kept so the asset pass can call the image endpoints. */
  fileKey: string
  /** Every distinct component encountered, keyed by component id. */
  components: Map<string, IRNode>
}
