#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  FigmaClient,
  type Layer,
  type LayerAssignment,
  assignLayers,
  auditDesign,
  collectTokens,
  emitThemeCss,
  normalize,
  parseFigmaTarget,
} from '@figma-to-react/core'
import { Command } from 'commander'
import {
  CONFIG_FILE,
  type DesignSystemConfig,
  ownership,
  readConfig,
  targetOf,
  writeConfig,
} from './config.js'
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
    .option('--no-font-import', 'skip the Google Fonts @import for the typefaces in use')
    .option('--stories', 'generate Storybook stories and the geometry their fidelity check needs')
    .option(
      '--fidelity-threshold <px>',
      'max px a node may differ from Figma before a story fails',
      '4',
    )
    .option('--dry-run', 'print what would be written without touching the filesystem')
    .option('--config <file>', 'design-system.json to read layers and ownership from', CONFIG_FILE),
).action(async (target: string, opts) => {
  await withErrorHandling(async () => {
    // The layer sorting and ownership live in the config, so the design notes
    // `gen` prints match what `audit` prints. Two different answers to "is this
    // sorted?" from the same repo is worse than not asking.
    const config = await readConfig(opts.config)
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
      fontImport: opts.fontImport !== false,
      stories: opts.stories === true,
      fidelityThreshold: Number(opts.fidelityThreshold),
      layers: config?.atomic?.layers,
      ...ownership(config),
      onProgress: progress,
    })

    const outDir = resolve(opts.out)
    const planned: [string, string | Uint8Array][] = [
      ...result.files.entries(),
      ...[...result.assets.entries()].map(
        ([name, bytes]) => [join('assets', name), bytes] as [string, Uint8Array],
      ),
    ]
    if (result.geometry) {
      planned.push(['figma-geometry.json', `${JSON.stringify(result.geometry, null, 2)}\n`])
    }
    if (result.fontCss) planned.push(['fonts.css', result.fontCss])
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
    if (result.stories.size > 0) {
      console.log(`  stories: ${result.stories.size} file(s)`)
    }
    if (result.themeCss) {
      console.log(
        '\nAdd to your stylesheet, in this order:\n' +
          (result.fontCss ? "  @import './fonts.css';\n" : '') +
          "  @import 'tailwindcss';\n" +
          "  @import './tokens.css';\n" +
          (result.fontCss
            ? 'fonts.css must come first: a CSS @import is only valid ahead of every other rule.\n'
            : '') +
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

program
  .command('audit')
  .argument('[figma-url]', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
  .description('report what the design file is missing, without generating anything')
  .option('-t, --token <token>', 'Figma personal access token (default: $FIGMA_TOKEN)')
  .option('--json', 'emit the findings as JSON')
  .option('--config <file>', 'design-system.json to read layers and ownership from', CONFIG_FILE)
  .action(async (target: string | undefined, opts) => {
    await withErrorHandling(async () => {
      const config = await readConfig(opts.config)
      const resolved = target ?? (config && targetOf(config))
      if (!resolved) {
        throw new Error(
          `No Figma target. Pass one, or run \`figma2react init\` to write ${opts.config}.`,
        )
      }

      const entry = await fetchEntry(resolved, requireToken(opts.token))
      const findings = auditDesign({
        document: entry.document,
        styles: entry.styles,
        layers: config?.atomic?.layers,
        ...ownership(config),
      })

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(findings, null, 2)}\n`)
        return
      }
      reportLayers(assignLayers({ document: entry.document, overrides: config?.atomic?.layers }))
      reportDesign(findings)
    })
  })

program
  .command('init')
  .description('ask which part of the Figma file to generate from, and write design-system.json')
  .option('--from <figma-url>', 'skip the prompt and use this target')
  .option('-t, --token <token>', 'Figma personal access token (default: $FIGMA_TOKEN)')
  .option('-o, --out <dir>', 'output directory for generated components')
  .option('--yes', 'accept every suggested layer without prompting')
  .option('--fixture <path>', 'recorded API response to record as the offline source')
  .option('--config <file>', 'where to write the config', CONFIG_FILE)
  .action(async (opts) => {
    await withErrorHandling(async () => {
      const existing = await readConfig(opts.config)
      const rl = opts.yes
        ? undefined
        : createInterface({ input: process.stdin, output: process.stdout })
      const ask = async (question: string, fallback: string) => {
        if (!rl) return fallback
        const answer = (
          await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)
        ).trim()
        return answer || fallback
      }

      try {
        // 1. The generate area. Everything else is scoped to it, so it is asked
        //    for first and never assumed.
        const target =
          opts.from ??
          (await ask('Figma URL or <fileKey>:<nodeId>', existing ? targetOf(existing) : ''))
        if (!target)
          throw new Error('No Figma target given. Nothing else can be resolved without one.')

        const { fileKey, nodeId } = parseFigmaTarget(target)
        const entry = await fetchEntry(target, requireToken(opts.token))
        const assignments = assignLayers({
          document: entry.document,
          overrides: existing?.atomic?.layers,
        })

        // 2. Layers: suggested with the evidence, confirmed by a person.
        console.log(`\nFound ${assignments.length} component(s) in ${entry.document.name}:\n`)
        const layers: Record<string, Layer> = {}
        for (const a of assignments) {
          const shown = a.layer ?? a.suggested
          console.log(`  ${a.name}`)
          console.log(`    ${a.layer ? `${a.layer} (from the ${a.source})` : a.reason}`)
          const answer = await ask('    layer (atom/molecule/organism, blank to skip)', shown ?? '')
          const layer = normalizeLayer(answer)
          // Only record what the file does not already say, so the config stays
          // a fallback rather than a second source of truth that can disagree.
          if (layer && a.source !== 'section' && a.source !== 'prefix') layers[a.name] = layer
          if (answer && !layer) console.log(`    not a layer, left unsorted: ${answer}`)
        }

        const owner = await ask('\nDefault ownership (specific/private/public)', 'public')
        const out =
          opts.out ?? (await ask('Output directory', existing?.out ?? 'src/design-system'))

        const config: DesignSystemConfig = {
          version: existing?.version ?? '0.1.0',
          file: { key: fileKey, ...(nodeId ? { node: nodeId } : {}), name: entry.document.name },
          out,
          gen: {
            traceIds: true,
            stories: true,
            fidelityThreshold: 4,
            minUses: 3,
            layout: 'flat',
            ...existing?.gen,
          },
          atomic: {
            layers: { ...existing?.atomic?.layers, ...layers },
            ownership: { default: owner, ...stripDefault(existing?.atomic?.ownership) },
          },
          offline: opts.fixture ? { fixture: opts.fixture } : existing?.offline,
          conventions: existing?.conventions,
        }
        await writeConfig(config, opts.config)
        console.log(`\nWrote ${opts.config}`)

        const unsorted = assignments.filter((a) => !a.layer && !layers[a.name])
        if (unsorted.length) {
          console.log(
            `\n${unsorted.length} component(s) still unsorted: ${unsorted.map((a) => a.name).join(', ')}.\n` +
              'Sort them in Figma with Atoms / Molecules / Organisms sections — that is where the\n' +
              'decision belongs, and it is the one place this config cannot drift from.',
          )
        }
      } finally {
        rl?.close()
      }
    })
  })

// ---------------------------------------------------------------------------

async function fetchEntry(target: string, token: string) {
  const { fileKey, nodeId } = parseFigmaTarget(target)
  const client = new FigmaClient({ token, baseUrl: apiBase() })
  const entry = nodeId
    ? (await client.getNodes(fileKey, [nodeId])).nodes[nodeId]
    : await client.getFile(fileKey)
  if (!entry) throw new Error(`Figma returned no node ${nodeId} in file ${fileKey}`)
  return entry
}

const normalizeLayer = (input: string): Layer | undefined => {
  const word = input.trim().toLowerCase().replace(/s$/, '')
  return word === 'atom' || word === 'molecule' || word === 'organism' ? word : undefined
}

const stripDefault = (o: Record<string, string> | undefined) => {
  if (!o) return {}
  const { default: _drop, ...rest } = o
  return rest
}

/** Printed above the findings, because "what is it?" comes before "what is wrong". */
function reportLayers(assignments: readonly LayerAssignment[]): void {
  if (assignments.length === 0) return
  console.log('\nLayers:\n')
  for (const a of assignments) {
    const shown = a.layer ? `${a.layer} (${a.source})` : `? suggested ${a.suggested ?? 'nothing'}`
    console.log(`  ${a.name.padEnd(22)} ${shown}`)
    if (!a.layer) console.log(`  ${' '.repeat(22)} ${a.reason}`)
  }
}

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
