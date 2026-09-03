#!/usr/bin/env node
/**
 * Drives `figma2react` from `design-system.json`, so nobody has to remember the
 * file key, the node id, or which flags the fidelity check depends on.
 *
 * Three things it does that the CLI deliberately does not, because they are
 * facts about *this repo* rather than about the tool:
 *
 *   1. Loads `.env`. Nothing in the packages reads it, by design — a library
 *      that reaches for ambient files is hard to test.
 *   2. Defaults to **offline**, serving the recorded response in
 *      `offline.fixture` from a local server. The Figma REST quota is set by
 *      plan tier and is the binding limit on this project, so spending it has
 *      to be deliberate: `--live`.
 *   3. Passes the real file key even offline. The fixture server ignores it,
 *      but Storybook's design panel does not — generating with a placeholder
 *      key produces stories whose Figma embed 404s, and Figma reports that as a
 *      permissions error, which sends you looking in the wrong place entirely.
 *
 * Usage:
 *   node scripts/ds.mjs init   [--live]        ask for the generate area, write the config
 *   node scripts/ds.mjs gen    [--live] [--layer atoms|molecules|organisms|theme]
 *   node scripts/ds.mjs tokens [--live] [--diff]
 *   node scripts/ds.mjs audit  [--live] [--json]
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(ROOT, 'packages/cli/dist/index.js')
const CONFIG = join(ROOT, 'design-system.json')
const RECORDED = 'packages/core/test/fixtures/design-system.json'

const COMMANDS = new Set(['init', 'gen', 'theme', 'tokens', 'audit', 'diff-tokens'])
/** Offline is the default for everything that only reads. */
const READ_ONLY = new Set(['audit', 'diff-tokens'])
/** `theme` only reaches the network when it is generating. */
const themeWrites = () => !has('--audit') && !has('--diff')

const argv = process.argv.slice(2)
const command = argv[0]
const flags = argv.slice(1)

if (!COMMANDS.has(command)) {
  console.error(`usage: node scripts/ds.mjs <${[...COMMANDS].join('|')}> [options]`)
  process.exit(1)
}

const has = (name) => flags.includes(name)
const valueOf = (name) => {
  const i = flags.indexOf(name)
  return i === -1 ? undefined : flags[i + 1]
}
const passthrough = () => {
  const drop = new Set(['--live', '--offline', '--diff', '--audit', '--layer'])
  const out = []
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--layer') {
      i++
      continue
    }
    if (!drop.has(flags[i])) out.push(flags[i])
  }
  return out
}

const live =
  has('--live') ||
  (!has('--offline') && !READ_ONLY.has(command) && (command !== 'theme' || themeWrites()))
const config = await loadConfig()

await loadEnv()

let server
let baseUrl
if (!live) {
  // Falls back to the recorded path so `init` works offline on a fresh repo:
  // requiring the config to find the fixture that `init` writes the config from
  // is a loop nobody can get out of.
  const fixture =
    config?.offline?.fixture ?? (existsSync(join(ROOT, RECORDED)) ? RECORDED : undefined)
  if (!fixture) {
    fail(
      'No recorded response to serve, and --live was not passed.\n' +
        `Record one with: figma2react inspect "<url>" --raw > ${RECORDED}`,
    )
  }
  ;({ server, baseUrl } = await serveFixture(join(ROOT, fixture)))
  console.error(`  offline: serving ${fixture}`)
} else {
  console.error('  live: this spends Figma REST quota')
}

const target = config ? targetOf(config) : undefined
const args = buildArgs()
const code = await runCli(args)
server?.close()
process.exit(code)

// ---------------------------------------------------------------------------

function buildArgs() {
  const rest = passthrough()
  switch (command) {
    case 'init': {
      // Record the fixture path on first run, so every later command can
      // default to offline without being told where the recording lives.
      const known = existsSync(join(ROOT, RECORDED)) && !rest.includes('--fixture')
      return ['init', ...(known ? ['--fixture', RECORDED] : []), ...rest]
    }
    case 'audit':
      return ['audit', ...(target ? [target] : []), ...rest]
    case 'tokens':
    case 'diff-tokens': {
      requireTarget()
      const out = command === 'diff-tokens' ? ['-o', join(ROOT, '.ds-tokens-next.css')] : []
      return ['tokens', target, '--min-uses', String(config.gen?.minUses ?? 3), ...out, ...rest]
    }
    case 'theme': {
      requireTarget()
      // Stage 0 — is the design ready to generate a theme from?
      if (has('--audit')) return ['audit', target, ...rest]
      // Stage 3 — what changed against the committed manifest.
      if (has('--diff')) return ['theme-diff', target, '-o', resolve(ROOT, config.out), ...rest]
      // Stage 1 — generate. The theme comes out of `gen` rather than its own
      // command because tokens.css, tokens.json and the theme story all fall
      // out of one collection pass; running it twice could disagree with itself.
      return buildGenArgs(rest)
    }
    case 'gen': {
      requireTarget()
      return buildGenArgs(rest)
    }
    default:
      return [command, ...rest]
  }
}

function buildGenArgs(rest) {
  const g = config.gen ?? {}
  const layer = valueOf('--layer')
  const base = config.out ?? 'src/design-system'
  return [
    'gen',
    target,
    '-o',
    resolve(ROOT, layer ? join(base, layer) : base),
    ...(g.traceIds === false ? [] : ['--trace-ids']),
    ...(g.stories === false ? [] : ['--stories']),
    '--fidelity-threshold',
    String(g.fidelityThreshold ?? 4),
    '--min-uses',
    String(g.minUses ?? 3),
    ...rest,
  ]
}

function requireTarget() {
  if (!target) fail(`No design-system.json. Run: node scripts/ds.mjs init --live`)
}

function runCli(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      stdio: 'inherit',
      env: { ...process.env, ...(baseUrl ? { FIGMA_API_BASE: baseUrl } : {}) },
    })
    child.on('close', (code) => done(code ?? 1))
  })
}

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return undefined
  }
}

/**
 * `.env` is gitignored and holds the personal access token. Read here rather
 * than in the library so the packages stay free of ambient filesystem reads.
 */
async function loadEnv() {
  if (process.env.FIGMA_TOKEN) return
  try {
    const text = await readFile(join(ROOT, '.env'), 'utf8')
    for (const line of text.split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  // Offline runs still go through requireToken, and any non-empty value passes.
  if (!live && !process.env.FIGMA_TOKEN) process.env.FIGMA_TOKEN = 'offline'
}

/**
 * The same shape the CLI e2e tests serve: enough of the REST API to satisfy a
 * whole `gen`, and nothing more. Image endpoints answer empty rather than 404
 * so an asset pass degrades to placeholders instead of failing the run.
 */
async function serveFixture(path) {
  const fixture = JSON.parse(await readFile(path, 'utf8'))
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const send = (body) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (url.pathname.endsWith('/nodes')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const nodes = {}
      for (const id of ids) nodes[id] = fixture.nodes[id] ?? null
      return send({ name: fixture.name, lastModified: fixture.lastModified, nodes })
    }
    if (url.pathname.startsWith('/v1/images/')) return send({ err: null, images: {} })
    if (url.pathname.endsWith('/images'))
      return send({ error: false, status: 200, meta: { images: {} } })
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{}')
  })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

function targetOf(c) {
  return c.file?.node ? `${c.file.key}:${c.file.node}` : c.file?.key
}

function fail(message) {
  console.error(`\nerror: ${message}`)
  process.exit(1)
}
