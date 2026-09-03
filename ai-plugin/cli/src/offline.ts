import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { DesignSystemConfig } from './config.js'

/**
 * The Figma REST quota is set by plan tier and is the binding limit on this
 * kind of project — one or two calls can lock the API out for hours. So the
 * commands that only *read* serve a recorded response by default, and spending
 * quota is something you ask for with `--live`.
 */

/** Commands that answer a question. Everything else writes, and defaults live. */
const READ_ONLY = new Set(['audit', 'theme-diff'])

export interface Runtime {
  live: boolean
  /** Set as FIGMA_API_BASE when serving a fixture. */
  baseUrl?: string
}

/**
 * `theme` is read-only in two of its three modes, and that has to be decided
 * from the mode flags rather than the command name. Getting this wrong spends
 * quota on a question that a recording could have answered — which is the exact
 * failure the offline default exists to prevent.
 */
const readOnly = (command: string, modes: ThemeModes): boolean =>
  READ_ONLY.has(command) || (command === 'theme' && Boolean(modes.audit || modes.diff))

interface ThemeModes {
  audit?: boolean
  diff?: boolean
}

export function isLive(
  command: string,
  opts: { live?: boolean; offline?: boolean },
  modes: ThemeModes = {},
): boolean {
  if (opts.live) return true
  if (opts.offline) return false
  return !readOnly(command, modes)
}

/**
 * Resolves the recorded response relative to the config that names it, not to
 * the working directory — the path in `design-system.json` is written next to
 * that file and has to mean the same thing from every directory.
 */
export function fixturePath(
  config: DesignSystemConfig | undefined,
  configPath: string | undefined,
): string | undefined {
  const named = config?.offline?.fixture
  if (!named) return undefined
  return resolve(configPath ? dirname(configPath) : process.cwd(), named)
}

/**
 * Enough of the REST API to satisfy a whole `gen`, and nothing more — the same
 * shape the e2e tests serve. Image endpoints answer empty rather than 404 so an
 * asset pass degrades to placeholders instead of failing the run.
 */
export async function serveFixture(path: string): Promise<string> {
  let fixture: {
    name?: string
    lastModified?: string
    nodes: Record<string, unknown>
  }
  try {
    fixture = JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No recorded response at ${path}.\n` +
          `Record one with: figma2react inspect "<url>" --raw > ${path}`,
      )
    }
    throw err
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const send = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (url.pathname.endsWith('/nodes')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const nodes: Record<string, unknown> = {}
      for (const id of ids) nodes[id] = fixture.nodes[id] ?? null
      return send({ name: fixture.name, lastModified: fixture.lastModified, nodes })
    }
    if (url.pathname.startsWith('/v1/images/')) return send({ err: null, images: {} })
    if (url.pathname.endsWith('/images'))
      return send({ error: false, status: 200, meta: { images: {} } })
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{}')
  })

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()))
  // Never hold the process open: the commands set `process.exitCode` and return
  // rather than calling exit, so a referenced handle would hang every run.
  server.unref()
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('fixture server has no port')
  return `http://127.0.0.1:${address.port}`
}
