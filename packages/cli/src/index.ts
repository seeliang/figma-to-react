#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import {
  FigmaClient,
  collectTokens,
  emitThemeCss,
  normalize,
  parseFigmaTarget,
} from '@figma-to-react/core'
import { Command } from 'commander'
import { run } from './pipeline.js'

const program = new Command()

program
  .name('figma2react')
  .description('Generate Tailwind-styled React components from a Figma frame')
  .version('0.1.0')

const withCommonOptions = (cmd: Command) =>
  cmd
    .option('-t, --token <token>', 'Figma personal access token (default: $FIGMA_TOKEN)')
    .option('--no-tokens', 'emit literal values instead of lifting them into a Tailwind theme')
    .option('--min-uses <n>', 'times an unnamed colour must appear to earn a theme entry', '3')

withCommonOptions(
  program
    .command('gen')
    .argument('<figma-url>', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('generate React components')
    .requiredOption('-o, --out <dir>', 'output directory')
    .option('--no-assets', 'skip downloading vectors and images')
    .option('--repeat-threshold <n>', 'identical siblings before collapsing into .map()', '3')
    .option('--no-semantics', 'emit plain divs instead of inferring <button>, <input> and <a>')
    .option('--no-design-notes', 'skip the report of gaps in the Figma file itself')
    .option('--trace-ids', 'emit data-figma-id on every element, for measuring layout fidelity')
    .option('--dry-run', 'print what would be written without touching the filesystem'),
).action(async (target: string, opts) => {
  await withErrorHandling(async () => {
    const result = await run({
      target,
      token: requireToken(opts.token),
      baseUrl: apiBase(),
      tokens: opts.tokens !== false,
      assets: opts.assets !== false,
      minUses: Number(opts.minUses),
      repeatThreshold: Number(opts.repeatThreshold),
      semantics: opts.semantics !== false,
      traceIds: opts.traceIds === true,
      onProgress: progress,
    })

    const outDir = resolve(opts.out)
    const planned: [string, string | Uint8Array][] = [
      ...result.files.entries(),
      ...[...result.assets.entries()].map(
        ([name, bytes]) => [join('assets', name), bytes] as [string, Uint8Array],
      ),
    ]
    if (result.themeCss) planned.push(['tokens.css', result.themeCss])

    if (opts.dryRun) {
      console.log(`\nWould write ${planned.length} file(s) to ${outDir}:`)
      for (const [name, body] of planned) {
        const size = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
        console.log(`  ${name} (${size} B)`)
      }
    } else {
      for (const [name, body] of planned) {
        const path = join(outDir, name)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, body)
      }
      console.log(`\nWrote ${planned.length} file(s) to ${relative(process.cwd(), outDir) || '.'}`)
    }

    for (const warning of result.warnings) console.warn(`  warning: ${warning}`)
    console.log(`  root component: <${result.rootComponent} />`)
    if (result.themeCss) {
      console.log(
        '\nAdd to your stylesheet (order matters):\n' +
          "  @import 'tailwindcss';\n" +
          "  @import './tokens.css';\n" +
          'If the output directory is gitignored, also add an @source line pointing at it.',
      )
    }

    if (opts.designNotes !== false) reportDesign(result.design)
  })
})

withCommonOptions(
  program
    .command('tokens')
    .argument('<figma-url>', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('extract design tokens as a Tailwind v4 @theme block')
    .option('-o, --out <file>', 'write to a file instead of stdout'),
).action(async (target: string, opts) => {
  await withErrorHandling(async () => {
    const doc = await fetchIr(target, requireToken(opts.token))
    const table = collectTokens(doc, { minUses: Number(opts.minUses) })
    const css = emitThemeCss(table)

    if (opts.out) {
      await mkdir(dirname(resolve(opts.out)), { recursive: true })
      await writeFile(resolve(opts.out), css)
      console.error(`Wrote ${table.tokens.length} token(s) to ${opts.out}`)
    } else {
      process.stdout.write(css)
    }
  })
})

program
  .command('inspect')
  .argument('<figma-url>', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
  .description('dump the intermediate representation as JSON')
  .option('-t, --token <token>', 'Figma personal access token (default: $FIGMA_TOKEN)')
  .option('--raw', 'dump the untouched Figma API response instead of the IR')
  .action(async (target: string, opts) => {
    await withErrorHandling(async () => {
      const token = requireToken(opts.token)
      if (opts.raw) {
        const { fileKey, nodeId } = parseFigmaTarget(target)
        const client = new FigmaClient({ token, baseUrl: apiBase() })
        const response = nodeId
          ? await client.getNodes(fileKey, [nodeId])
          : await client.getFile(fileKey)
        process.stdout.write(JSON.stringify(response, null, 2))
        return
      }
      const doc = await fetchIr(target, token)
      // Maps do not survive JSON.stringify; components are keyed by id.
      process.stdout.write(
        JSON.stringify({ root: doc.root, components: Object.fromEntries(doc.components) }, null, 2),
      )
    })
  })

// ---------------------------------------------------------------------------

async function fetchIr(target: string, token: string) {
  const { fileKey, nodeId } = parseFigmaTarget(target)
  const client = new FigmaClient({ token, baseUrl: apiBase() })
  const entry = nodeId
    ? (await client.getNodes(fileKey, [nodeId])).nodes[nodeId]
    : await client.getFile(fileKey)
  if (!entry) throw new Error(`Figma returned no node ${nodeId} in file ${fileKey}`)
  return normalize({
    fileKey,
    document: entry.document,
    components: entry.components,
    componentSets: entry.componentSets,
    styles: entry.styles,
  })
}

/**
 * Overridable so the CLI can be pointed at a fixture server in tests, and at
 * https://api.figma-gov.com for Figma Government tenants.
 */
const apiBase = (): string | undefined => process.env.FIGMA_API_BASE

function requireToken(flag?: string): string {
  const token = flag ?? process.env.FIGMA_TOKEN
  if (!token) {
    throw new Error(
      'No Figma token. Pass --token, or set FIGMA_TOKEN.\n' +
        'Create one at https://www.figma.com/developers/api#access-tokens (scopes: file_content:read, file_dev_resources:read).',
    )
  }
  return token
}

const SEVERITY_LABEL = { high: '!!', medium: ' !', low: '  ' } as const

/**
 * Reported separately from warnings, and worded as a design issue on purpose:
 * these are things no amount of code can fix, because the information was never
 * put in the file. Each one names the Figma action that resolves it.
 */
function reportDesign(findings: readonly import('@figma-to-react/core').DesignFinding[]): void {
  if (findings.length === 0) {
    console.log('\nDesign file: nothing to flag.')
    return
  }
  console.log(`\nDesign file — ${findings.length} thing(s) to fix in Figma, not in code:\n`)
  for (const f of findings) {
    console.log(`  ${SEVERITY_LABEL[f.severity]} ${f.title}`)
    console.log(`     fix: ${f.fix}`)
    if (f.examples.length) console.log(`     e.g. ${f.examples.join(', ')}`)
    console.log()
  }
}

/** Progress goes to stderr so `inspect` and `tokens` stay pipeable. */
const progress = (message: string) => console.error(`  ${message}`)

async function withErrorHandling(fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  }
}

program.parseAsync(process.argv)
