import type { FileNodesResponse, ImageFillsResponse, ImagesResponse } from './types.js'

const DEFAULT_BASE = 'https://api.figma.com'

/** Figma caps `ids` per request; batch well below any documented URL limit. */
const IMAGE_BATCH_SIZE = 50

export class FigmaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message)
  }
}

export interface FigmaClientOptions {
  token: string
  baseUrl?: string
  /** Total attempts per request, including the first. */
  maxAttempts?: number
  /** Injected in tests; defaults to global fetch. */
  fetch?: typeof globalThis.fetch
  /** Injected in tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class FigmaClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly maxAttempts: number
  private readonly doFetch: typeof globalThis.fetch
  private readonly sleep: (ms: number) => Promise<void>

  constructor(opts: FigmaClientOptions) {
    if (!opts.token) {
      throw new FigmaApiError('Missing Figma token — set FIGMA_TOKEN or pass --token', 0, '')
    }
    this.token = opts.token
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE
    this.maxAttempts = opts.maxAttempts ?? 4
    this.doFetch = opts.fetch ?? globalThis.fetch
    this.sleep = opts.sleep ?? defaultSleep
  }

  /**
   * `GET /v1/files/:key/nodes` — the subtree for one or more node ids.
   * `geometry=paths` is requested so vector nodes carry enough data to be
   * recognised even before we round-trip them through the image endpoint.
   */
  async getNodes(fileKey: string, ids: string[]): Promise<FileNodesResponse> {
    const params = new URLSearchParams({ ids: ids.join(','), geometry: 'paths' })
    return this.get<FileNodesResponse>(`/v1/files/${fileKey}/nodes?${params}`)
  }

  /** `GET /v1/files/:key` — the whole document. Use `depth` to avoid huge payloads. */
  async getFile(fileKey: string, depth?: number): Promise<FileNodesResponse['nodes'][string]> {
    const params = new URLSearchParams({ geometry: 'paths' })
    if (depth !== undefined) params.set('depth', String(depth))
    const res = await this.get<{
      document: FileNodesResponse['nodes'][string] extends null ? never : unknown
    }>(`/v1/files/${fileKey}?${params}`)
    return res as unknown as FileNodesResponse['nodes'][string]
  }

  /**
   * `GET /v1/images/:key?format=svg` — renders nodes to hosted SVGs.
   * Batched: one request per {@link IMAGE_BATCH_SIZE} ids, never one per node.
   * Returns a map of node id to a temporary S3 URL (or null if Figma failed it).
   */
  async exportImages(
    fileKey: string,
    ids: string[],
    format: 'svg' | 'png' = 'svg',
    scale = 1,
  ): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {}
    for (let i = 0; i < ids.length; i += IMAGE_BATCH_SIZE) {
      const batch = ids.slice(i, i + IMAGE_BATCH_SIZE)
      const params = new URLSearchParams({ ids: batch.join(','), format })
      if (format === 'png' && scale !== 1) params.set('scale', String(scale))
      const res = await this.get<ImagesResponse>(`/v1/images/${fileKey}?${params}`)
      if (res.err) throw new FigmaApiError(`Image export failed: ${res.err}`, 200, fileKey)
      Object.assign(out, res.images)
    }
    return out
  }

  /** `GET /v1/files/:key/images` — download URLs for `imageRef` raster fills. */
  async getImageFills(fileKey: string): Promise<Record<string, string>> {
    const res = await this.get<ImageFillsResponse>(`/v1/files/${fileKey}/images`)
    return res.meta.images
  }

  /** Fetch a rendered asset body (SVG markup, or bytes for raster). */
  async fetchAsset(url: string): Promise<Response> {
    const res = await this.doFetch(url)
    if (!res.ok) throw new FigmaApiError(`Asset fetch failed: ${res.statusText}`, res.status, url)
    return res
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    let lastError: FigmaApiError | undefined

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const res = await this.doFetch(url, {
        headers: { 'X-Figma-Token': this.token },
      })

      if (res.ok) return (await res.json()) as T

      const body = await res.text().catch(() => '')
      lastError = new FigmaApiError(
        `Figma API ${res.status} ${res.statusText}${body ? `: ${truncate(body)}` : ''}`,
        res.status,
        url,
      )

      // 429 and 5xx are transient; 4xx otherwise means a bad token or id and
      // retrying only burns quota.
      if (res.status !== 429 && res.status < 500) throw lastError
      if (attempt === this.maxAttempts) break

      await this.sleep(backoffMs(attempt, res.headers.get('retry-after')))
    }

    throw lastError!
  }
}

/** Exponential backoff with jitter, capped; honours `Retry-After` when present. */
export function backoffMs(attempt: number, retryAfter?: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000)
  }
  const base = Math.min(2 ** (attempt - 1) * 500, 16_000)
  return base + Math.random() * 250
}

function truncate(s: string, max = 300): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}
