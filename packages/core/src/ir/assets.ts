import type { FigmaClient } from '../figma/client.js'
import { walk } from './normalize.js'
import type { IRDocument, IRNode } from './types.js'

export interface AssetOptions {
  /** Raster files to write, keyed by file name relative to the assets dir. */
  onProgress?: (message: string) => void
  /** Skip network calls; vectors fall back to a placeholder element. */
  skip?: boolean
}

export interface AssetResult {
  /** Raster asset file name to bytes. Callers write these next to the components. */
  files: Map<string, Uint8Array>
  /** Node ids whose export Figma refused. */
  failed: string[]
}

/**
 * Fills in every `asset` on the tree: vectors get inline SVG markup, raster
 * fills get a downloaded file. Both are batched — one image-export request per
 * 50 vectors, one fills request for the whole file — because the naive
 * per-node approach hits Figma's rate limiter almost immediately.
 */
export async function resolveAssets(
  doc: IRDocument,
  client: FigmaClient,
  options: AssetOptions = {},
): Promise<AssetResult> {
  const result: AssetResult = { files: new Map(), failed: [] }
  if (options.skip) return result

  const vectors: IRNode[] = []
  const images: IRNode[] = []
  walk(doc.root, (node) => {
    if (node.asset?.kind === 'svg') vectors.push(node)
    if (node.asset?.kind === 'image') images.push(node)
  })
  for (const component of doc.components.values()) {
    walk(component, (node) => {
      if (node.asset?.kind === 'svg' && !vectors.includes(node)) vectors.push(node)
      if (node.asset?.kind === 'image' && !images.includes(node)) images.push(node)
    })
  }

  if (vectors.length > 0) {
    options.onProgress?.(
      `Exporting ${vectors.length} vector${vectors.length === 1 ? '' : 's'} as SVG`,
    )
    await inlineVectors(doc, client, vectors, result)
  }

  if (images.length > 0) {
    options.onProgress?.(`Downloading ${images.length} image${images.length === 1 ? '' : 's'}`)
    await downloadImages(doc, client, images, result)
  }

  return result
}

async function inlineVectors(
  doc: IRDocument,
  client: FigmaClient,
  vectors: IRNode[],
  result: AssetResult,
): Promise<void> {
  const urls = await client.exportImages(doc.fileKey, [
    ...new Set(vectors.map((v) => v.asset!.ref)),
  ])

  // One fetch per distinct URL, run together rather than one after another.
  const markup = new Map<string, string>()
  await Promise.all(
    Object.entries(urls).map(async ([id, url]) => {
      if (!url) return
      const res = await client.fetchAsset(url)
      markup.set(id, await res.text())
    }),
  )

  for (const node of vectors) {
    const svg = markup.get(node.asset!.ref)
    if (svg) node.asset!.svg = svgToJsx(svg)
    else result.failed.push(node.id)
  }
}

async function downloadImages(
  doc: IRDocument,
  client: FigmaClient,
  images: IRNode[],
  result: AssetResult,
): Promise<void> {
  const fills = await client.getImageFills(doc.fileKey)

  await Promise.all(
    [...new Set(images.map((n) => n.asset!.ref))].map(async (ref) => {
      const url = fills[ref]
      if (!url) return
      const res = await client.fetchAsset(url)
      const bytes = new Uint8Array(await res.arrayBuffer())
      const fileName = `${ref}${extensionFor(res.headers.get('content-type'), url)}`
      result.files.set(fileName, bytes)
    }),
  )

  for (const node of images) {
    const match = [...result.files.keys()].find((f) => f.startsWith(node.asset!.ref))
    if (match) node.asset!.fileName = match
    else result.failed.push(node.id)
  }
}

function extensionFor(contentType: string | null, url: string): string {
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg'
  if (contentType?.includes('gif')) return '.gif'
  if (contentType?.includes('svg')) return '.svg'
  if (contentType?.includes('webp')) return '.webp'
  const fromUrl = /\.(png|jpe?g|gif|svg|webp)(?:\?|$)/i.exec(url)
  return fromUrl ? `.${fromUrl[1]!.toLowerCase()}` : '.png'
}

// ---------------------------------------------------------------------------
// SVG → JSX
// ---------------------------------------------------------------------------

/** Attributes JSX spells differently from SVG, beyond the kebab→camel rule. */
const ATTR_RENAMES: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace',
}

/**
 * Figma's exported SVG is valid XML but not valid JSX: hyphenated attributes
 * (`fill-rule`), `class`, XML declarations and comments all have to go. Width
 * and height are stripped too, so the surrounding Tailwind classes control the
 * size — otherwise the export's intrinsic pixel size silently wins.
 */
export function svgToJsx(svg: string): string {
  let out = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim()

  // Only rewrite attribute names, never text content or attribute values.
  out = out.replace(
    /<([a-zA-Z][\w:-]*)((?:\s+[^<>"']+(?:"[^"]*"|'[^']*')?)*)\s*(\/?)>/g,
    (_match, tag: string, attrs: string, selfClose: string) =>
      `<${tag}${rewriteAttrs(attrs)}${selfClose ? ' /' : ''}>`,
  )

  // Size comes from the className the emitter puts on the root <svg>.
  out = out
    .replace(/^(<svg\b[^>]*?)\s+width="[^"]*"/, '$1')
    .replace(/^(<svg\b[^>]*?)\s+height="[^"]*"/, '$1')

  return out
}

function rewriteAttrs(attrs: string): string {
  // The leading whitespace is part of the match so it is replaced, not doubled.
  return attrs.replace(
    /\s*([a-zA-Z][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g,
    (_m, name: string, value: string) => {
      const renamed = ATTR_RENAMES[name] ?? (isPassThrough(name) ? name : toCamelAttr(name))
      return ` ${renamed}=${value.startsWith("'") ? `"${value.slice(1, -1)}"` : value}`
    },
  )
}

/** `data-*`, `aria-*` and namespaced xmlns attributes keep their hyphens in JSX. */
const isPassThrough = (name: string) =>
  name.startsWith('data-') || name.startsWith('aria-') || name.startsWith('xmlns')

const toCamelAttr = (name: string) => name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
