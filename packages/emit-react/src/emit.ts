import type { IRDocument, IRNode, TokenResolver } from '@figma-to-react/core'
import { noTokens } from '@figma-to-react/core'
import { NameRegistry, toCamelCase, toFileName, toPascalCase } from './naming.js'
import { semanticFor, textLeaves, textTagFor } from './semantics.js'
import type { Semantic } from './semantics.js'
import { classesFor, placementClasses } from './tailwind.js'

export interface EmitOptions {
  resolver?: TokenResolver
  /**
   * Minimum run of structurally identical siblings before they are collapsed
   * into a `.map()`. Two is usually coincidence; three is a list.
   */
  repeatThreshold?: number
  /** Emit each distinct component to its own file and import it. */
  splitComponents?: boolean
  /**
   * Above this many text leaves, a node is a page rather than a parameterised
   * component, and its copy is emitted literally instead of as props. Figma
   * auto-names text layers after their own content, so a spec sheet would
   * otherwise produce dozens of props named things like `n2563Eb`.
   */
  maxTextSlots?: number
  /**
   * Emit `data-figma-id` on every element. Off by default — it is debug output,
   * not something to ship — but it is what lets a rendered page be measured
   * against the Figma geometry it came from, node by node.
   */
  traceIds?: boolean
  /**
   * Infer `<button>`, `<input>` and `<a>` from layer names. On by default:
   * a `<div>` styled as a button has no keyboard activation and is not
   * announced as a button, which is a correctness problem, not a cosmetic one.
   */
  semantics?: boolean
}

export interface EmitResult {
  /** Relative file path to file contents. */
  files: Map<string, string>
  /** The exported name of the root component. */
  rootComponent: string
}

interface EmitState {
  resolver: TokenResolver
  repeatThreshold: number
  maxTextSlots: number
  semantics: boolean
  traceIds: boolean
  registry: NameRegistry
  /** Component id to the name and file it was emitted as. */
  emitted: Map<string, { name: string; file: string }>
  /** Files produced so far. */
  files: Map<string, string>
  /** Imports needed by the file currently being written. */
  imports: Set<string>
  /** Component id whose definition file is currently being rendered, if any. */
  currentComponentId?: string
  splitComponents: boolean
}

export function emit(doc: IRDocument, options: EmitOptions = {}): EmitResult {
  const state: EmitState = {
    resolver: options.resolver ?? noTokens,
    repeatThreshold: options.repeatThreshold ?? 3,
    maxTextSlots: options.maxTextSlots ?? 12,
    semantics: options.semantics ?? true,
    traceIds: options.traceIds ?? false,
    registry: new NameRegistry(),
    emitted: new Map(),
    files: new Map(),
    imports: new Set(),
    splitComponents: options.splitComponents ?? true,
  }

  // Components first: the root's own instances resolve to imports of these.
  if (state.splitComponents) {
    for (const [id, node] of doc.components) emitComponent(id, node, state)
  }

  state.currentComponentId = undefined
  const rootName = state.registry.claim(doc.root.id, doc.root.name)
  const rootFile = toFileName(rootName)
  state.files.set(rootFile, renderFile(rootName, doc.root, state, { isComponentRoot: true }))

  return { files: state.files, rootComponent: rootName }
}

function emitComponent(id: string, node: IRNode, state: EmitState): void {
  if (state.emitted.has(id)) return
  // The main component's name (`Button/Primary`) is more meaningful and more
  // stable than the instance layer's name, which designers rename freely.
  const name = state.registry.claim(id, node.component?.name ?? node.name)
  const file = toFileName(name)
  // Reserve the slot before rendering: a component that contains an instance of
  // itself would otherwise recurse forever.
  state.emitted.set(id, { name, file })
  const previous = state.currentComponentId
  state.currentComponentId = id
  state.files.set(file, renderFile(name, node, state, { isComponentRoot: true }))
  state.currentComponentId = previous
}

// ---------------------------------------------------------------------------
// props: text slots
// ---------------------------------------------------------------------------

interface TextSlot {
  /** Index path from the component root, used to match override sites. */
  path: number[]
  prop: string
  defaultValue: string
}

/**
 * Every text leaf inside a component becomes a prop, defaulting to whatever the
 * design says. That is what turns a component used 30 times into one file with
 * 30 call sites rather than 30 copies of the same markup.
 */
function textSlots(root: IRNode): TextSlot[] {
  const slots: TextSlot[] = []
  const used = new Set<string>()

  const visit = (node: IRNode, path: number[]) => {
    if (node.kind === 'text') {
      let prop = toCamelCase(node.name)
      let n = 2
      while (used.has(prop)) prop = `${toCamelCase(node.name)}${n++}`
      used.add(prop)
      slots.push({ path, prop, defaultValue: node.content ?? '' })
      return
    }
    node.children.forEach((child, i) => visit(child, [...path, i]))
  }

  root.children.forEach((child, i) => visit(child, [i]))
  return slots
}

/** Follow an index path from a root, or undefined if the structure diverges. */
function at(root: IRNode, path: number[]): IRNode | undefined {
  let node: IRNode | undefined = root
  for (const i of path) node = node?.children[i]
  return node
}

// ---------------------------------------------------------------------------
// file rendering
// ---------------------------------------------------------------------------

function renderFile(
  name: string,
  root: IRNode,
  state: EmitState,
  opts: { isComponentRoot: boolean },
): string {
  state.imports = new Set()

  const found = opts.isComponentRoot ? textSlots(root) : []
  const slots = found.length > state.maxTextSlots ? [] : found
  const slotByNode = new Map<string, TextSlot>()
  for (const slot of slots) {
    const node = at(root, slot.path)
    if (node) slotByNode.set(node.id, slot)
  }

  const body = renderNode(root, undefined, state, { slotByNode, indent: 2 })

  const propsType = slots.length
    ? `export type ${name}Props = {\n${slots.map((s) => `  ${s.prop}?: string`).join('\n')}\n}\n\n`
    : ''

  const signature = slots.length
    ? `{ ${slots.map((s) => `${s.prop} = ${quote(s.defaultValue)}`).join(', ')} }: ${name}Props = {}`
    : ''

  const importLines = [...state.imports].sort().join('\n')

  return `${importLines ? `${importLines}\n\n` : ''}${propsType}export function ${name}(${signature}) {
  return (
${body}
  )
}
`
}

interface RenderCtx {
  slotByNode: Map<string, TextSlot>
  indent: number
  /**
   * Set inside `<button>` and `<a>`, which accept phrasing content only. A `<p>`
   * there is invalid HTML, so text becomes a `<span>`.
   */
  phrasingOnly?: boolean
}

function renderNode(
  node: IRNode,
  parent: IRNode | undefined,
  state: EmitState,
  ctx: RenderCtx,
): string {
  const pad = ' '.repeat(ctx.indent)

  // Both a definition and a use collapse to a single tag; the definition's own
  // markup lives in its file, which is rendered separately.
  if (
    (node.kind === 'instance' || node.kind === 'component') &&
    node.component &&
    state.splitComponents
  ) {
    // Skip inside the component's own definition file: that instance *is*
    // the definition, so it must render its markup rather than import itself.
    const target = state.emitted.get(node.component.id)
    if (target && node.component.id !== state.currentComponentId) {
      state.imports.add(
        `import { ${target.name} } from './${target.file.replace(/\.tsx$/, '.js')}'`,
      )
      const tag = `<${target.name}${instanceProps(node, ctx)} />`

      // The tag itself takes no className, so anything that places it inside
      // the parent has to go on a wrapper. Without this a component dropped
      // into an absolutely positioned parent lands at the flow position and
      // silently overlaps whatever is already there.
      const placement = placementClasses(node, {
        resolver: state.resolver,
        parent: parent?.layout,
      })
      const trace = traceAttr(node, state)
      return placement || trace
        ? `${pad}<div${placement ? ` className=${quote(placement)}` : ''}${trace}>\n${pad}  ${tag}\n${pad}</div>`
        : `${pad}${tag}`
    }
  }

  const className = classesFor(node, { resolver: state.resolver, parent: parent?.layout })
  const attrs = (className ? ` className=${quote(className)}` : '') + traceAttr(node, state)

  switch (node.kind) {
    case 'text':
      return renderText(node, attrs, ctx, pad)
    case 'image':
      return `${pad}<img${attrs} src={${assetExpr(node)}} alt="" />`
    case 'vector':
      return renderVector(node, attrs, pad)
    default:
      return renderBox(node, className, state, ctx, pad)
  }
}

function renderBox(
  node: IRNode,
  className: string,
  state: EmitState,
  ctx: RenderCtx,
  pad: string,
): string {
  const semantic = state.semantics
    ? semanticFor(node, node.component?.name ?? node.name)
    : undefined

  if (semantic) return renderSemantic(node, semantic, className, state, ctx, pad)

  const attrs = className ? ` className=${quote(className)}` : ''
  if (node.children.length === 0) return `${pad}<div${attrs} />`

  const children = renderChildren(node, state, { ...ctx, indent: ctx.indent + 2 })
  return `${pad}<div${attrs}>\n${children}\n${pad}</div>`
}

/**
 * Renders a node the name rules identified as a real element.
 *
 * A void element (`<input>`) cannot hold its text, so the text leaf is dropped
 * and its content moves to `placeholder`. Its styling would be lost with it, so
 * the leaf's classes are merged onto the element — that is where the font size
 * and text colour live.
 */
function renderSemantic(
  node: IRNode,
  semantic: Semantic,
  classNameIn: string,
  state: EmitState,
  ctx: RenderCtx,
  pad: string,
): string {
  const leaf = textLeaves(node)[0]!
  const attrs = [...semantic.attrs]
  const className = [classNameIn, ...(semantic.classes ?? [])].filter(Boolean).join(' ')

  if (semantic.void) {
    // Take only what the dropped text leaf contributes that the container does
    // not: how the text looks. Its box classes would fight the container's —
    // the leaf's `h-full` against the container's `h-11` is two heights on one
    // element, decided by stylesheet order rather than by intent.
    const leafClasses = classesFor(leaf, { resolver: state.resolver, parent: node.layout })
      .split(' ')
      .filter(isTypographyClass)
    const merged = [className, ...leafClasses, ...replacedSize(node, state)]
      .filter(Boolean)
      .join(' ')
    attrs.push(`${semantic.text}={${textExpr(leaf, ctx)}}`)
    if (merged) attrs.push(`className=${quote(merged)}`)
    const trace = traceAttr(node, state).trim()
    if (trace) attrs.push(trace)
    return `${pad}<${semantic.tag} ${attrs.join(' ')} />`
  }

  if (className) attrs.push(`className=${quote(className)}`)
  const semanticTrace = traceAttr(node, state).trim()
  if (semanticTrace) attrs.push(semanticTrace)
  const children = renderChildren(node, state, {
    ...ctx,
    indent: ctx.indent + 2,
    phrasingOnly: semantic.phrasingOnly,
  })
  return `${pad}<${semantic.tag} ${attrs.join(' ')}>\n${children}\n${pad}</${semantic.tag}>`
}

/**
 * A replaced element sizes itself: `<input>` defaults to roughly 20 characters
 * wide regardless of its content, so a node that hugged in Figma comes out
 * wider and pushes the layout around it. Where the design measured a hug, pin
 * that measurement.
 */
function replacedSize(node: IRNode, state: EmitState): string[] {
  const { width } = node.layout
  if (width.kind !== 'hug' || width.px === undefined) return []
  void state
  return [`w-[${width.px}px]`]
}

const TYPOGRAPHY =
  /^(text-|font-|leading-|tracking-|italic$|uppercase$|lowercase$|capitalize$|underline$|line-through$)/

/** Distinguishes `text-slate-400` and `font-medium` from `flex-1` and `h-full`. */
const isTypographyClass = (cls: string): boolean => TYPOGRAPHY.test(cls)

/** `data-figma-id`, or nothing when tracing is off. */
const traceAttr = (node: IRNode, state: EmitState): string =>
  state.traceIds ? ` data-figma-id=${quote(node.id)}` : ''

/** The text as a JSX expression: a prop reference where one exists, else a literal. */
function textExpr(leaf: IRNode, ctx: RenderCtx): string {
  const slot = ctx.slotByNode.get(leaf.id)
  return slot ? slot.prop : quote(leaf.content ?? '')
}

/**
 * Collapses runs of structurally identical siblings into a `.map()`. Identity
 * is "same rendered markup once text is blanked out", which catches list rows
 * and card grids without needing to understand what they are.
 */
function renderChildren(node: IRNode, state: EmitState, ctx: RenderCtx): string {
  const rendered = node.children.map((child) => renderNode(child, node, state, ctx))
  const shapes = node.children.map((child) => structuralKey(child, state, node))

  const parts: string[] = []
  let i = 0

  while (i < node.children.length) {
    let end = i + 1
    while (end < node.children.length && shapes[end] === shapes[i]) end++

    const runLength = end - i
    if (runLength >= state.repeatThreshold) {
      const collapsed = collapseRun(node.children.slice(i, end), node, state, ctx)
      if (collapsed) {
        parts.push(collapsed)
        i = end
        continue
      }
    }

    for (let j = i; j < end; j++) parts.push(rendered[j]!)
    i = end
  }

  return parts.join('\n')
}

/**
 * A run collapses only if the sibling texts differ — otherwise `.map()` over
 * identical items is harder to read than writing them out.
 */
function collapseRun(
  run: IRNode[],
  parent: IRNode,
  state: EmitState,
  ctx: RenderCtx,
): string | undefined {
  const texts = run.map(collectText)
  const width = texts[0]!.length
  if (width === 0 || texts.some((t) => t.length !== width)) return undefined

  const varying = Array.from(
    { length: width },
    (_, col) => new Set(texts.map((t) => t[col]!)).size > 1,
  )
  if (!varying.some(Boolean)) return undefined

  const pad = ' '.repeat(ctx.indent)
  const itemName = `${lowerFirst(toPascalCase(parent.name))}Items`

  // Only the varying columns become fields; the rest stay literal in the markup.
  const fields = varying.map((v, i) => (v ? `t${i}` : undefined))
  const rows = texts.map(
    (t) =>
      `${pad}  { ${fields
        .map((f, i) => (f ? `${f}: ${quote(t[i]!)}` : ''))
        .filter(Boolean)
        .join(', ')} }`,
  )

  const template = renderNode(run[0]!, parent, state, { ...ctx, indent: ctx.indent + 4 })
  let col = -1
  const templated = template.replace(TEXT_CHILD_RE, (match, content: string) => {
    col++
    return fields[col] ? `>{item.${fields[col]}}<` : match
  })
  if (col + 1 !== width) return undefined

  return [
    `${pad}{[`,
    rows.join(',\n'),
    `${pad}].map((item, i) => (`,
    templated.replace(/^(\s*<\w+)/, `$1 key={i}`),
    `${pad}))}`,
  ].join('\n')
}

/** Matches the text between a JSX open and close tag on one line. */
const TEXT_CHILD_RE = />([^<>{}]*)</g

function collectText(node: IRNode): string[] {
  const out: string[] = []
  const visit = (n: IRNode) => {
    if (n.kind === 'text') out.push(n.content ?? '')
    n.children.forEach(visit)
  }
  visit(node)
  return out
}

/** Two nodes share a key when they render identically with text blanked out. */
function structuralKey(node: IRNode, state: EmitState, parent: IRNode): string {
  const parts: string[] = []
  const visit = (n: IRNode, p: IRNode | undefined) => {
    parts.push(n.kind, classesFor(n, { resolver: state.resolver, parent: p?.layout }))
    parts.push(String(n.children.length))
    n.children.forEach((c) => visit(c, n))
  }
  visit(node, parent)
  return parts.join('|')
}

// ---------------------------------------------------------------------------
// leaves
// ---------------------------------------------------------------------------

function renderText(node: IRNode, attrs: string, ctx: RenderCtx, pad: string): string {
  const slot = ctx.slotByNode.get(node.id)
  const tag = textTagFor(node, ctx.phrasingOnly === true)
  const content = slot ? `{${slot.prop}}` : jsxText(node.content ?? '')
  return `${pad}<${tag}${attrs}>${content}</${tag}>`
}

function renderVector(node: IRNode, attrs: string, pad: string): string {
  if (node.asset?.svg) {
    // The exported SVG already carries width/height; className goes on it so
    // layout classes still apply.
    return pad + node.asset.svg.replace('<svg', `<svg${attrs}`).replace(/\n/g, `\n${pad}`)
  }
  // The asset pass has not run (or the export failed). Emit something that is
  // sized correctly and trivially greppable rather than silently nothing.
  return `${pad}<span${attrs} data-figma-vector=${quote(node.id)} aria-hidden="true" />`
}

const assetExpr = (node: IRNode): string =>
  node.asset?.fileName ? `${quote(`./assets/${node.asset.fileName}`)}` : `undefined`

/**
 * An instance's text becomes props on the child component. Where the enclosing
 * component also exposes that text as a prop of its own, the two are wired
 * together — `<ButtonPrimary label={label} />` — so a caller can drive nested
 * text from the top. Without this the outer prop would be declared and never
 * read, which `tsc --noEmit` rightly rejects.
 */
function instanceProps(node: IRNode, ctx: RenderCtx): string {
  const overrides = collectTextWithNames(node)
  if (overrides.length === 0) return ''
  return overrides
    .map(({ prop, value, source }) => {
      const slot = ctx.slotByNode.get(source.id)
      return slot ? ` ${prop}={${slot.prop}}` : ` ${prop}=${quote(value)}`
    })
    .join('')
}

function collectTextWithNames(node: IRNode): { prop: string; value: string; source: IRNode }[] {
  const out: { prop: string; value: string; source: IRNode }[] = []
  const used = new Set<string>()
  const visit = (n: IRNode) => {
    if (n.kind === 'text') {
      let prop = toCamelCase(n.name)
      let i = 2
      while (used.has(prop)) prop = `${toCamelCase(n.name)}${i++}`
      used.add(prop)
      out.push({ prop, value: n.content ?? '', source: n })
      return
    }
    n.children.forEach(visit)
  }
  node.children.forEach(visit)
  return out
}

// ---------------------------------------------------------------------------
// string helpers
// ---------------------------------------------------------------------------

/** JSX text needs escaping for braces and angle brackets; strings do not. */
function jsxText(s: string): string {
  if (s === '') return ''
  if (/[{}<>]/.test(s) || s.includes('\n')) return `{${quote(s)}}`
  return s
}

function quote(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
  return `'${escaped}'`
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
