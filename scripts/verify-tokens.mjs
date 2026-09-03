#!/usr/bin/env node
/**
 * Two checks the browser cannot do, and one it should not have to.
 *
 * 1. **Drift** — re-collects the token table from the recorded Figma response
 *    and diffs it against the committed `tokens.json`. Catches the case where
 *    the design moved and nobody regenerated, or where somebody edited
 *    generated output by hand.
 *
 * 2. **Collisions** — an app may import several `@theme` blocks, and Tailwind
 *    resolves a repeated custom property by import order. Two design files
 *    that both synthesise `--color-blue-600` therefore silently agree on one
 *    value, and the loser renders wrong while every build stays green. That is
 *    this project's recurring failure shape, so it is reported by name.
 *
 * Node only: no browser, no Playwright, so it runs in CI without a runner.
 */
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import {
  FigmaClient,
  buildTokenManifest,
  collectTokens,
  diffTokenManifests,
  isEmptyDiff,
  normalize,
  parseFigmaTarget,
} from '../packages/core/dist/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const config = JSON.parse(await readFile(join(ROOT, 'design-system.json'), 'utf8'))
const outDir = join(ROOT, config.out)

let failed = false
await checkDrift()
await checkCollisions()
process.exit(failed ? 1 : 0)

// ---------------------------------------------------------------------------

async function checkDrift() {
  const committed = JSON.parse(await readFile(join(outDir, 'tokens.json'), 'utf8'))
  const fresh = await collectFromFixture()
  const diff = diffTokenManifests(committed, fresh)

  if (isEmptyDiff(diff)) {
    console.log(`tokens.json matches the design file: ${committed.tokens.length} token(s).`)
    return
  }

  failed = true
  console.error('\ntokens.json no longer matches the design file:\n')
  for (const t of diff.added) console.error(`  + ${t.cssVar}: ${t.value}`)
  for (const t of diff.removed) console.error(`  - ${t.cssVar}: ${t.value}`)
  for (const { before, after } of diff.changed) {
    console.error(`  ~ ${after.cssVar}: ${before.value} -> ${after.value}`)
  }
  console.error('\nRun `pnpm ds:gen` to regenerate, or revert the hand edit.')
}

async function collectFromFixture() {
  const fixture = JSON.parse(await readFile(join(ROOT, config.offline.fixture), 'utf8'))
  const { server, baseUrl } = await serve(fixture)
  try {
    const { fileKey, nodeId } = parseFigmaTarget(
      config.file.node ? `${config.file.key}:${config.file.node}` : config.file.key,
    )
    const client = new FigmaClient({ token: 'offline', baseUrl })
    const response = await client.getNodes(fileKey, [nodeId])
    const entry = response.nodes[nodeId]
    const doc = normalize({
      fileKey,
      document: entry.document,
      components: entry.components,
      componentSets: entry.componentSets,
      styles: entry.styles,
    })
    const table = collectTokens(doc, { minUses: config.gen?.minUses ?? 3 })
    return buildTokenManifest(table, {
      key: fileKey,
      node: nodeId,
      lastModified: response.lastModified,
    })
  } finally {
    server.close()
  }
}

/**
 * Every `@theme` block the app's stylesheet pulls in, checked for the same
 * property declared twice at different values.
 */
async function checkCollisions() {
  const stylesheet = join(ROOT, 'examples/src/styles.css')
  const css = await readFile(stylesheet, 'utf8')

  const declarations = new Map() // property -> [{ file, value }]
  for (const [, rel] of css.matchAll(/@import\s+['"](\.[^'"]+)['"]/g)) {
    const path = resolve(dirname(stylesheet), rel)
    let body
    try {
      body = await readFile(path, 'utf8')
    } catch {
      continue
    }
    for (const [, prop, value] of body.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
      const list = declarations.get(prop) ?? []
      list.push({ file: rel, value: value.trim() })
      declarations.set(prop, list)
    }
  }

  const clashes = [...declarations.entries()].filter(
    ([, uses]) => new Set(uses.map((u) => u.value)).size > 1,
  )
  if (clashes.length === 0) {
    console.log(`No conflicting @theme declarations across ${declarations.size} propert(ies).`)
    return
  }

  // Reported, not fatal: the value that wins is well-defined (last import), so
  // this is a design-file collision to resolve rather than a broken build.
  console.warn(`\n${clashes.length} propert(ies) declared more than once, at different values:\n`)
  for (const [prop, uses] of clashes) {
    console.warn(`  ${prop}`)
    for (const u of uses) console.warn(`    ${u.value.padEnd(30)} ${u.file}`)
    console.warn(`    -> ${uses[uses.length - 1].value} wins, by import order.\n`)
  }
  console.warn(
    'Two design files are synthesising the same name for different colours. Bind a Colour\n' +
      'Style in at least one of them, or keep their themes out of the same stylesheet.',
  )
}

function serve(fixture) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.writeHead(200, { 'content-type': 'application/json' })
    if (url.pathname.endsWith('/nodes')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const nodes = {}
      for (const id of ids) nodes[id] = fixture.nodes[id] ?? null
      return res.end(
        JSON.stringify({ name: fixture.name, lastModified: fixture.lastModified, nodes }),
      )
    }
    res.end('{}')
  })
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () =>
      ok({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }),
    )
  })
}
