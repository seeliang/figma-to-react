/**
 * Figma URLs come in two shapes and encode the node id differently from the API:
 *
 *   https://www.figma.com/design/<fileKey>/<slug>?node-id=1-2   (current)
 *   https://www.figma.com/file/<fileKey>/<slug>?node-id=1%3A2   (legacy)
 *
 * The URL uses `1-2`; every REST endpoint wants `1:2`.
 */

export interface FigmaTarget {
  fileKey: string
  /** Node id in API form (`1:2`), or undefined when the URL points at a whole file. */
  nodeId?: string
}

const PATH_RE = /\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/

export class FigmaUrlError extends Error {}

/** Convert the URL form of a node id (`1-2`) to the API form (`1:2`). */
export function toApiNodeId(id: string): string {
  return id.includes(':') ? id : id.replace(/-/g, ':')
}

/** Convert the API form of a node id (`1:2`) to the URL form (`1-2`). */
export function toUrlNodeId(id: string): string {
  return id.replace(/:/g, '-')
}

/**
 * Accepts a full Figma URL, or a bare file key, or `<fileKey>:<nodeId>`.
 * Returns the file key plus an optional node id in API form.
 */
export function parseFigmaTarget(input: string): FigmaTarget {
  const trimmed = input.trim()
  if (!trimmed) throw new FigmaUrlError('Empty Figma target')

  if (!/^https?:\/\//i.test(trimmed)) {
    // Bare key, optionally with a node id appended: `abc123` or `abc123:1-2`.
    const [key, ...rest] = trimmed.split(/[#\s]/)[0]!.split(',')
    const [fileKey, node] = splitBareKey(key!)
    if (!/^[A-Za-z0-9]+$/.test(fileKey)) {
      throw new FigmaUrlError(`Not a Figma URL or file key: ${input}`)
    }
    void rest
    return node ? { fileKey, nodeId: toApiNodeId(node) } : { fileKey }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new FigmaUrlError(`Malformed URL: ${input}`)
  }

  const match = PATH_RE.exec(url.pathname)
  if (!match) {
    throw new FigmaUrlError(
      `Could not find a file key in ${url.pathname} — expected /design/<key>/… or /file/<key>/…`,
    )
  }

  const nodeParam = url.searchParams.get('node-id') ?? url.searchParams.get('node_id')
  return nodeParam ? { fileKey: match[1]!, nodeId: toApiNodeId(nodeParam) } : { fileKey: match[1]! }
}

function splitBareKey(key: string): [string, string | undefined] {
  // `abc123:1-2` — the first colon separates key from node id, but a node id
  // may itself contain colons (`1:2`), so only split once.
  const idx = key.indexOf(':')
  if (idx === -1) return [key, undefined]
  return [key.slice(0, idx), key.slice(idx + 1)]
}
