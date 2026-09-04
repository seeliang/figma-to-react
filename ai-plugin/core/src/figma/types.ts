/**
 * Hand-written types for the slice of the Figma REST API we actually consume.
 * Deliberately partial: typing the full API surface is a maintenance sink, and
 * anything we do not read here is better left as `unknown`.
 *
 * Reference: https://developers.figma.com/docs/rest-api/
 */

export type NodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'SECTION'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE'

export interface Color {
  r: number
  g: number
  b: number
  a: number
}

export interface ColorStop {
  position: number
  color: Color
}

export interface Paint {
  type:
    | 'SOLID'
    | 'GRADIENT_LINEAR'
    | 'GRADIENT_RADIAL'
    | 'GRADIENT_ANGULAR'
    | 'GRADIENT_DIAMOND'
    | 'IMAGE'
  visible?: boolean
  opacity?: number
  color?: Color
  gradientHandlePositions?: { x: number; y: number }[]
  gradientStops?: ColorStop[]
  imageRef?: string
  scaleMode?: 'FILL' | 'FIT' | 'TILE' | 'STRETCH'
}

export interface Effect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean
  color?: Color
  offset?: { x: number; y: number }
  radius?: number
  spread?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface TypeStyle {
  fontFamily?: string
  fontPostScriptName?: string | null
  fontWeight?: number
  fontSize?: number
  italic?: boolean
  lineHeightPx?: number
  lineHeightPercentFontSize?: number
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC_%'
  letterSpacing?: number
  textAlignHorizontal?: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED'
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
  textCase?: 'UPPER' | 'LOWER' | 'TITLE' | 'ORIGINAL'
  textDecoration?: 'NONE' | 'STRIKETHROUGH' | 'UNDERLINE'
}

/**
 * `boundVariables` is the only variable information available outside the
 * Enterprise-gated `/v1/files/:key/variables/local` endpoint. Shape varies by
 * field: scalar fields hold one alias, `fills`/`strokes` hold an array.
 */
export interface VariableAlias {
  type: 'VARIABLE_ALIAS'
  id: string
}

/**
 * Bindings arrive in three shapes, not one. `fills` and `strokes` are arrays;
 * `color` and `fontSize` are a bare alias; corner radii come as a *nested map*
 * under `rectangleCornerRadii`, keyed `RECTANGLE_TOP_LEFT_CORNER_RADIUS` and so
 * on. Only reading the first two silently dropped every radius Variable.
 */
export type BoundVariables = Record<
  string,
  VariableAlias | VariableAlias[] | Record<string, VariableAlias> | undefined
>

export type LayoutMode = 'NONE' | 'HORIZONTAL' | 'VERTICAL'
export type AxisAlign = 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN' | 'BASELINE'
export type LayoutSizing = 'FIXED' | 'HUG' | 'FILL'

export interface FigmaNode {
  id: string
  name: string
  type: NodeType
  visible?: boolean
  children?: FigmaNode[]

  // geometry
  absoluteBoundingBox?: Rect | null
  absoluteRenderBounds?: Rect | null
  size?: { x: number; y: number }
  rotation?: number
  isMask?: boolean
  clipsContent?: boolean

  // auto layout
  layoutMode?: LayoutMode
  layoutWrap?: 'NO_WRAP' | 'WRAP'
  primaryAxisAlignItems?: AxisAlign
  counterAxisAlignItems?: AxisAlign
  primaryAxisSizingMode?: 'FIXED' | 'AUTO'
  counterAxisSizingMode?: 'FIXED' | 'AUTO'
  layoutSizingHorizontal?: LayoutSizing
  layoutSizingVertical?: LayoutSizing
  layoutGrow?: number
  layoutAlign?: 'MIN' | 'CENTER' | 'MAX' | 'STRETCH' | 'INHERIT'
  itemSpacing?: number
  counterAxisSpacing?: number | null
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number

  // paint
  fills?: Paint[]
  strokes?: Paint[]
  strokeWeight?: number
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER'
  strokeDashes?: number[]
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number }
  effects?: Effect[]
  opacity?: number
  cornerRadius?: number
  rectangleCornerRadii?: [number, number, number, number]

  // text
  characters?: string
  style?: TypeStyle

  // components
  componentId?: string
  componentProperties?: Record<string, { type: string; value: unknown }>

  // styles + variables
  styles?: Record<string, string>
  boundVariables?: BoundVariables
}

export interface ComponentMeta {
  key: string
  name: string
  description?: string
  componentSetId?: string
}

export interface StyleMeta {
  key: string
  name: string
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
  description?: string
}

/** Response of `GET /v1/files/:key/nodes?ids=…` */
export interface FileNodesResponse {
  name: string
  lastModified: string
  nodes: Record<
    string,
    {
      document: FigmaNode
      components: Record<string, ComponentMeta>
      componentSets: Record<string, ComponentMeta>
      styles: Record<string, StyleMeta>
    } | null
  >
}

/** Response of `GET /v1/images/:key?ids=…&format=svg` */
export interface ImagesResponse {
  err: string | null
  images: Record<string, string | null>
}

/** Response of `GET /v1/files/:key/images` (raster fill refs) */
export interface ImageFillsResponse {
  error: boolean
  status: number
  meta: { images: Record<string, string> }
}
