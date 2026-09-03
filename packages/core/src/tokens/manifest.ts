import type { Token, TokenTable } from './collect.js'
import { NAMESPACE } from './emit.js'
import type { TokenKind } from './types.js'

/**
 * The token table, written to disk beside the CSS.
 *
 * The CSS is for browsers; this is for everything else — the generated theme
 * story, the check that every token reached the bundle, and the diff between
 * two generations. Re-parsing `tokens.css` to recover the same information is
 * possible but wrong: an app can import several `@theme` blocks, later
 * declarations win, and the parsed result answers "what does the page use"
 * rather than "what did this design file produce".
 */
export interface TokenManifestEntry {
  kind: TokenKind
  /** Theme name without its namespace: `blue-600`. */
  name: string
  /** The full custom property: `--color-blue-600`. */
  cssVar: string
  /** As emitted into the `@theme` block, so a comparison needs no conversion. */
  value: string
  uses: number
  /**
   * Whether a human named this, or the generator derived it from the value.
   *
   * A derived name describes a colour; it cannot say what the colour is for.
   * This flag is what makes that visible in the story and in the audit rather
   * than only in somebody's memory.
   */
  named: boolean
  sources: { source: 'style' | 'variable'; key: string; name?: string }[]
}

export interface TokenManifest {
  figma: { key: string; node?: string; lastModified?: string }
  /** Per kind, so a generated test can assert the count before the values. */
  counts: Partial<Record<TokenKind, number>>
  fonts: { family: string; styles: { weight: number; italic: boolean }[] }[]
  tokens: TokenManifestEntry[]
}

export interface ManifestSource {
  key: string
  node?: string
  lastModified?: string
}

export function buildTokenManifest(table: TokenTable, figma: ManifestSource): TokenManifest {
  const tokens = [...table.tokens]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map(entry)

  const counts: Partial<Record<TokenKind, number>> = {}
  for (const t of tokens) counts[t.kind] = (counts[t.kind] ?? 0) + 1

  return { figma, counts, fonts: table.fonts, tokens }
}

const entry = (t: Token): TokenManifestEntry => ({
  kind: t.kind,
  name: t.name,
  cssVar: `${NAMESPACE[t.kind]}-${t.name}`,
  value: t.value,
  uses: t.uses,
  // Variables usually arrive without a name — the endpoint that carries them is
  // Enterprise-gated — so a bound Variable still counts as unnamed here. That is
  // the honest reading: the generator has no name from it either.
  named: t.sources.some((s) => Boolean(s.name)),
  sources: t.sources.map((s) => ({
    source: s.source,
    key: s.key,
    ...(s.name ? { name: s.name } : {}),
  })),
})

/** What changed between two generations, for review. */
export interface TokenDiff {
  added: TokenManifestEntry[]
  removed: TokenManifestEntry[]
  changed: { before: TokenManifestEntry; after: TokenManifestEntry }[]
}

export function diffTokenManifests(before: TokenManifest, after: TokenManifest): TokenDiff {
  const b = new Map(before.tokens.map((t) => [t.cssVar, t]))
  const a = new Map(after.tokens.map((t) => [t.cssVar, t]))

  return {
    added: after.tokens.filter((t) => !b.has(t.cssVar)),
    removed: before.tokens.filter((t) => !a.has(t.cssVar)),
    changed: after.tokens
      .map((t) => ({ before: b.get(t.cssVar)!, after: t }))
      .filter((p) => p.before && p.before.value !== p.after.value),
  }
}

export const isEmptyDiff = (d: TokenDiff) =>
  d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0
