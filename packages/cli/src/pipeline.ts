import {
  FigmaClient,
  auditDesign,
  collectTokens,
  emitFontCss,
  emitThemeCss,
  normalize,
  parseFigmaTarget,
  resolveAssets,
} from '@figma-to-react/core'
import type { DesignFinding, IRDocument, TokenTable } from '@figma-to-react/core'
import { emit, formatAll } from '@figma-to-react/emit-react'
import { emitStories, exportGeometry } from '@figma-to-react/emit-storybook'
import type { Geometry } from '@figma-to-react/emit-storybook'

export interface RunOptions {
  target: string
  token: string
  /** Override the API host; used by tests and by Figma Government tenants. */
  baseUrl?: string
  /** Lift repeated values into a Tailwind `@theme` block. */
  tokens: boolean
  /** Download vectors and images. */
  assets: boolean
  minUses?: number
  repeatThreshold?: number
  /** Infer `<button>`, `<input>` and `<a>` from layer names. */
  semantics?: boolean
  /** Emit `data-figma-id` on every element, for layout measurement. */
  traceIds?: boolean
  /** Emit a Google Fonts `@import` for the typefaces in use. */
  fontImport?: boolean
  /** Generate Storybook stories, plus the geometry their fidelity check needs. */
  stories?: boolean
  /** Max px a node may differ from Figma before a story's play function fails. */
  fidelityThreshold?: number
  onProgress?: (message: string) => void
}

export interface RunResult {
  doc: IRDocument
  table?: TokenTable
  rootComponent: string
  /** Component sources, keyed by file name relative to the output dir. */
  files: Map<string, string>
  /** Binary assets, keyed by file name relative to `<out>/assets`. */
  assets: Map<string, Uint8Array>
  themeCss?: string
  /** Loads the typefaces the theme names; must be imported before anything else. */
  fontCss?: string
  warnings: string[]
  /** Gaps in the design file, as distinct from problems with this tool. */
  design: DesignFinding[]
  /** Story sources, keyed by file name relative to the output dir. */
  stories: Map<string, string>
  /** Figma geometry the stories measure against; only when stories are on. */
  geometry?: Geometry
}

/**
 * The whole pipeline: fetch → normalize → tokens → assets → emit.
 *
 * Kept separate from the command definitions so `gen` and `tokens` share one
 * code path, and so it can be driven from a script without the CLI.
 */
export async function run(options: RunOptions): Promise<RunResult> {
  const { fileKey, nodeId } = parseFigmaTarget(options.target)
  const client = new FigmaClient({ token: options.token, baseUrl: options.baseUrl })
  const warnings: string[] = []

  options.onProgress?.(`Fetching ${nodeId ? `node ${nodeId}` : 'file'} from ${fileKey}`)
  const entry = nodeId
    ? (await client.getNodes(fileKey, [nodeId])).nodes[nodeId]
    : await client.getFile(fileKey)

  if (!entry) {
    throw new Error(
      `Figma returned no node ${nodeId} in file ${fileKey}. Check the node id and that the token can read this file.`,
    )
  }

  const doc = normalize({
    fileKey,
    document: entry.document,
    components: entry.components,
    componentSets: entry.componentSets,
    styles: entry.styles,
  })

  const design = auditDesign({ document: entry.document, styles: entry.styles })

  let table: TokenTable | undefined
  if (options.tokens) {
    table = collectTokens(doc, { minUses: options.minUses ?? 3 })
    options.onProgress?.(`Collected ${table.tokens.length} design tokens`)
  }

  const assetResult = await resolveAssets(doc, client, {
    skip: !options.assets,
    onProgress: options.onProgress,
  })
  if (assetResult.failed.length > 0) {
    warnings.push(
      `Figma could not export ${assetResult.failed.length} asset(s): ${assetResult.failed.join(', ')}. They are emitted as placeholder elements.`,
    )
  }

  const emitted = emit(doc, {
    resolver: table?.resolver,
    repeatThreshold: options.repeatThreshold ?? 3,
    semantics: options.semantics ?? true,
    traceIds: options.traceIds ?? false,
  })

  const stories = new Map<string, string>()
  let geometry: Geometry | undefined

  if (options.stories) {
    geometry = exportGeometry(entry.document)
    // Without `data-figma-id` there is nothing for a play function to match on,
    // so the assertion would pass by measuring nothing at all.
    if (!options.traceIds) {
      warnings.push(
        'Stories were generated without --trace-ids, so their fidelity check can only assert the story root, not each node.',
      )
    }
    for (const s of emitStories(emitted.components, {
      fileKey,
      fidelity: { threshold: options.fidelityThreshold ?? 4, helperPath: '../fidelity/assert.js' },
    })) {
      stories.set(s.file, s.source)
    }
    options.onProgress?.(`Generated ${stories.size} story file(s)`)
  }

  const files = await formatAll(new Map([...emitted.files, ...stories]), (file, err) => {
    warnings.push(`Could not format ${file} (emitted unformatted): ${(err as Error).message}`)
  })

  return {
    doc,
    table,
    rootComponent: emitted.rootComponent,
    files,
    assets: assetResult.files,
    themeCss: table ? emitThemeCss(table) : undefined,
    fontCss:
      table && options.fontImport !== false && table.fonts.length > 0
        ? emitFontCss(table.fonts)
        : undefined,
    warnings,
    design,
    stories,
    geometry,
  }
}
