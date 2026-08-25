import type { IRNode } from '@figma-to-react/core'

/**
 * Figma carries no semantic information. A rounded rectangle with centred text
 * is pixel-identical whether it is a button, an input, a badge or a chip, so a
 * purely visual reading of the file can only ever produce `<div>` and `<p>`.
 * That output is not merely inelegant: a `<div>` styled as a button has no
 * keyboard activation and is not announced as a button, and a `<p>` styled as
 * an input cannot be typed into.
 *
 * The one signal the file does carry is the name the designer gave the layer.
 * These rules read it. They are heuristics and they can misfire, which is why
 * `--no-semantics` turns them off wholesale.
 */

export interface Semantic {
  tag: string
  /** Attributes to add, already rendered as JSX source. */
  attrs: string[]
  /** `children` puts the text inside the tag; `placeholder` moves it to an attribute. */
  text: 'children' | 'placeholder'
  /** True for tags that may only contain phrasing content, so `<p>` is invalid inside. */
  phrasingOnly: boolean
  /** True for void elements, which must be self-closing and take no children. */
  void: boolean
}

interface Rule {
  match: RegExp
  semantic: Semantic
}

/**
 * Ordered: the first match wins, so the more specific patterns come first.
 * `checkbox` before `box`, `textarea` before `text`.
 */
const RULES: Rule[] = [
  {
    match: /\b(button|btn|cta)\b/i,
    semantic: {
      tag: 'button',
      attrs: ['type="button"'],
      text: 'children',
      phrasingOnly: true,
      void: false,
    },
  },
  {
    match: /\b(link|anchor)\b/i,
    semantic: { tag: 'a', attrs: ['href="#"'], text: 'children', phrasingOnly: true, void: false },
  },
  {
    match: /\btextarea\b/i,
    semantic: { tag: 'textarea', attrs: [], text: 'placeholder', phrasingOnly: true, void: true },
  },
  {
    match: /\b(search)\b/i,
    semantic: {
      tag: 'input',
      attrs: ['type="search"'],
      text: 'placeholder',
      phrasingOnly: true,
      void: true,
    },
  },
  {
    match: /\b(input|textbox|text field)\b/i,
    semantic: {
      tag: 'input',
      attrs: ['type="text"'],
      text: 'placeholder',
      phrasingOnly: true,
      void: true,
    },
  },
]

/**
 * Resolves the element for a container node.
 *
 * A rule only applies to a node whose entire subtree is a single text leaf.
 * That guard is what keeps a wrapper called `Form Field` — a label stacked
 * above an input — from collapsing into one `<input>`; only the inner control
 * matches. It also means a card that merely mentions "button" in its name is
 * left alone.
 */
export function semanticFor(node: IRNode, name: string): Semantic | undefined {
  if (!isSingleTextContainer(node)) return undefined
  const rule = RULES.find((r) => r.match.test(name))
  return rule?.semantic
}

/** The node's whole subtree is exactly one text leaf. */
function isSingleTextContainer(node: IRNode): boolean {
  return textLeaves(node).length === 1 && node.children.length > 0
}

export function textLeaves(node: IRNode): IRNode[] {
  const out: IRNode[] = []
  const visit = (n: IRNode) => {
    if (n.kind === 'text') out.push(n)
    else n.children.forEach(visit)
  }
  node.children.forEach(visit)
  return out
}

/**
 * `<p>` is flow content and is invalid inside `<button>` or `<a>`, which accept
 * phrasing content only. Inside one of those, text becomes a `<span>`.
 */
export function textTagFor(node: IRNode, phrasingOnly: boolean): string {
  if (phrasingOnly) return 'span'
  const size = node.text?.fontSize?.px ?? 16
  if (size >= 32) return 'h1'
  if (size >= 24) return 'h2'
  if (size >= 18) return 'h3'
  return 'p'
}
