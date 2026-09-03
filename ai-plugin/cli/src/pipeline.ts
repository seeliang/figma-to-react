import {
  FigmaClient,
  auditDesign,
  buildTokenManifest,
  collectTokens,
  emitFontCss,
  emitThemeCss,
  normalize,
  parseFigmaTarget,
  resolveAssets,
} from '@figma-to-react/core'
import type {
  DesignFinding,
  IRDocument,
  Layer,
  TokenManifest,
  TokenTable,
} from '@figma-to-react/core'
import { emit, formatAll } from '@figma-to-react/emit-react'
import type { ComponentEntry } from '@figma-to-react/emit-react'
import { emitStories, emitThemeStory, exportGeometry } from '@figma-to-react/emit-storybook'
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
  /** Atomic layer per component, for components Figma does not sort itself. */
  layers?: Record<string, Layer>
  /** Package specifiers used for imports that cross a layer boundary. */
  layerPackages?: Partial<Record<Layer, string>>
  /** Specific / private / public, per component name. */
  ownership?: Record<string, string>
  defaultOwnership?: string
  onProgress?: (message: string) => void
}

export interface RunResult {
  doc: IRDocument
  table?: TokenTable
  rootComponent: string
  /** Component manifest, used by the CLI to route files to layer packages. */
  components: ComponentEntry[]
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
  /**
   * The token table as data, written beside the CSS.
   *
   * The CSS is for browsers; this is for the generated theme story, the check
   * that each token reached the bundle, and the diff between two generations.
   */
  tokenManifest?: TokenManifest
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
  // `lastModified` lives on the response, not on the node — and it is what ties
  // generated output to a state of the design file rather than to a clock.
  let lastModified: string | undefined
  let entry
  if (nodeId) {
    const response = await client.getNodes(fileKey, [nodeId])
    lastModified = response.lastModified
    entry = response.nodes[nodeId]
  } else {
    entry = await client.getFile(fileKey)
  }

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

  const design = auditDesign({
    document: entry.document,
    styles: entry.styles,
    layers: options.layers,
    ownership: options.ownership,
    defaultOwnership: options.defaultOwnership,
  })

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
    layers: options.layers,
    layerPackages: options.layerPackages,
  })

  const tokenManifest = table
    ? buildTokenManifest(table, {
        key: fileKey,
        ...(nodeId ? { node: nodeId } : {}),
        ...(lastModified ? { lastModified } : {}),
      })
    : undefined

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
      fidelity: { threshold: options.fidelityThreshold ?? 4, helperPath: './fidelity.js' },
    })) {
      stories.set(s.file, s.source)
    }
    // The theme story is generated from the manifest, so the number of
    // assertions is decided by the design rather than by whoever wrote a test.
    if (tokenManifest && tokenManifest.tokens.length > 0) {
      const theme = emitThemeStory(tokenManifest, { helperPath: '@figma-to-react/testing/theme' })
      stories.set(theme.file, theme.source)
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
    components: emitted.components,
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
    tokenManifest,
  }
}
