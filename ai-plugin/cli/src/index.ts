#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  FigmaClient,
  type Layer,
  type LayerAssignment,
  type TokenManifest,
  assignLayers,
  auditDesign,
  buildTokenManifest,
  collectTokens,
  diffTokenManifests,
  emitThemeCss,
  isEmptyDiff,
  normalize,
  parseFigmaTarget,
} from '@figma-to-react/core'
import { Command } from 'commander'
import {
  CONFIG_FILE,
  type DesignSystemConfig,
  type OutputLayer,
  outputDirectory,
  ownership,
  readConfig,
  targetOf,
  writeConfig,
} from './config.js'
import { findConfig, loadEnv } from './env.js'
import { fixturePath, isLive, serveFixture } from './offline.js'
import { run } from './pipeline.js'

const program = new Command()

program
  .name('figma2react')
  .description('Generate plain-CSS React components from a Figma frame')
  .version('0.1.0')
  .option('--offline', 'serve the recorded response in design-system.json instead of calling Figma')
  .option('--live', 'call the Figma REST API, spending quota')

/**
 * Where the config was actually found, so every command reads the same file and
 * resolves relative paths against the same directory.
 */
let locatedConfig: string | undefined

/**
 * Everything ambient happens here, once, before any command body runs: find the
 * config, load the token beside it, and decide whether this invocation is
 * allowed to spend Figma quota. Commands stay pure functions of their options.
 */
program.hook('preAction', async (_root, action) => {
  const opts = program.opts<{ offline?: boolean; live?: boolean }>()
  const actionOpts = action.opts() as {
    config?: string
    audit?: boolean
    diff?: boolean
    apply?: boolean
  }
  locatedConfig = await findConfig(actionOpts.config)
  await loadEnv(locatedConfig)

  const colorPreview = action.name() === 'theme' && action.args[0] === 'color' && !actionOpts.apply
  const live = isLive(action.name(), opts, { ...actionOpts, colorPreview })
  if (live) {
    console.error('  live: this spends Figma REST quota')
    return
  }

  const config = await readConfig(configFile())
  const fixture = fixturePath(config, locatedConfig)
  if (!fixture) {
    throw new Error(
      'Nothing to serve offline: no `offline.fixture` in the config.\n' +
        'Record one with: figma2react inspect "<url>" --raw > <path>, then name it in the config.',
    )
  }
  process.env.FIGMA_API_BASE = await serveFixture(fixture)
  // The fixture server ignores the token, but `requireToken` still runs, and a
  // missing token offline is not a real failure.
  process.env.FIGMA_TOKEN ??= 'offline'
  console.error(`  offline: serving ${relative(process.cwd(), fixture) || fixture}`)
})

/** The config path every command should read: the located one, or the flag. */
const configFile = (explicit?: string): string => locatedConfig ?? explicit ?? CONFIG_FILE

/**
 * A target given on the command line always wins; otherwise it comes from the
 * config, which is the whole reason the config exists.
 */
function resolveTarget(target: string | undefined, config: DesignSystemConfig | undefined): string {
  const resolved = target ?? (config && targetOf(config))
  if (!resolved) {
    throw new Error(
      `No Figma target. Pass one, or run \`figma2react init\` to write ${CONFIG_FILE}.`,
    )
  }
  return resolved
}

const withCommonOptions = (cmd: Command) =>
  cmd
    .option('-t, --token <token>', 'Figma personal access token (default: $FIGMA_TOKEN)')
    .option('--no-tokens', 'emit literal values instead of writing CSS custom properties')
    .option('--min-uses <n>', 'times an unnamed colour must appear to earn a theme entry', '3')

withCommonOptions(
  program
    .command('gen')
    .argument('[figma-url]', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('generate React components')
    .option('-o, --out <dir>', 'output directory')
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
    .option('--layer <name>', 'generate one configured layer: theme | atom | molecule | organism')
    .option('--dry-run', 'print what would be written without touching the filesystem')
    .option('--config <file>', 'design-system.json to read layers and ownership from', CONFIG_FILE),
).action(async (target: string | undefined, opts, command: Command) => {
  await withErrorHandling(() => runGen(target, opts, command))
})

interface GenOptions {
  token?: string
  out?: string
  config?: string
  tokens?: boolean
  assets?: boolean
  minUses: string
  repeatThreshold: string
  semantics?: boolean
  traceIds?: boolean
  fontImport?: boolean
  stories?: boolean
  fidelityThreshold: string
  layer?: string
  dryRun?: boolean
  designNotes?: boolean
  apply?: boolean
  requireBoundColours?: boolean
}

/**
 * Shared by `gen` and `theme`: the theme falls out of the same collection pass
 * that produces the components, so running it twice could disagree with itself.
 */
async function runGen(
  target: string | undefined,
  opts: GenOptions,
  command: Command,
): Promise<void> {
  {
    // The layer sorting and ownership live in the config, so the design notes
    // `gen` prints match what `audit` prints. Two different answers to "is this
    // sorted?" from the same repo is worse than not asking.
    const config = await readConfig(configFile(opts.config))
    const resolvedTarget = resolveTarget(target, config)
    // The config's `gen` flags describe *its own* design system, not whatever
    // file you happen to point the tool at. Pointing `gen` at a different
    // target and silently inheriting another file's flags would be an ambush,
    // so the defaults apply only when the config is describing this target.
    const describesTarget = Boolean(config && targetOf(config) === resolvedTarget)
    const gen = describesTarget ? (config?.gen ?? {}) : {}
    // A flag the caller actually typed beats the config; an untouched flag sits
    // at its commander default and lets the config speak.
    const untouched = (name: string) => command.getOptionValueSource(name) === 'default'
    const requestedLayer = opts.layer as OutputLayer | undefined
    if (config?.out && typeof config.out !== 'string' && !requestedLayer && !opts.out) {
      for (const layer of ['theme', 'atom', 'molecule', 'organism'] as const) {
        if (config.out[layer]) await runGen(target, { ...opts, layer }, command)
      }
      return
    }
    const outDirName = opts.out ?? outputDirectory(config, requestedLayer)
    if (!outDirName) {
      throw new Error('No output directory. Pass --out, or set `out` in the config.')
    }
    const result = await run({
      target: resolvedTarget,
      token: requireToken(opts.token),
      baseUrl: apiBase(),
      tokens: opts.tokens !== false,
      assets: opts.assets !== false,
      minUses:
        untouched('minUses') && gen.minUses !== undefined ? gen.minUses : Number(opts.minUses),
      repeatThreshold: Number(opts.repeatThreshold),
      semantics: opts.semantics !== false,
      traceIds: opts.traceIds === true || (describesTarget ? gen.traceIds !== false : false),
      fontImport: opts.fontImport !== false,
      stories: opts.stories === true || (describesTarget ? gen.stories !== false : false),
      fidelityThreshold:
        untouched('fidelityThreshold') && gen.fidelityThreshold !== undefined
          ? gen.fidelityThreshold
          : Number(opts.fidelityThreshold),
      layers: config?.atomic?.layers,
      layerPackages: { atom: '@ds/atoms', molecule: '@ds/molecules', organism: '@ds/organisms' },
      ...ownership(config),
      onProgress: progress,
    })
    if (
      opts.requireBoundColours &&
      result.design.some((finding) => finding.code === 'unbound-colours')
    ) {
      throw new Error(
        'Colour refresh was not applied: bind every colour to a Figma Colour Style or Variable first.',
      )
    }

    const base = locatedConfig && !opts.out ? join(dirname(locatedConfig), outDirName) : outDirName
    const outDir = resolve(base)
    const selectedFiles = new Set(
      result.components
        .filter((component) => !requestedLayer || component.layer === requestedLayer)
        .map((component) => component.file),
    )
    const selectedStories = new Set(
      [...result.stories.entries()]
        .filter(([file, source]) =>
          !requestedLayer || requestedLayer === 'theme'
            ? file === 'theme.stories.tsx'
            : result.components
                .filter((component) => component.layer === requestedLayer)
                .some((component) => source.includes(`{ ${component.exportName} }`)),
        )
        .map(([file]) => file),
    )
    const planned: [string, string | Uint8Array][] = [
      ...[...result.files.entries()].filter(
        ([name]) => !requestedLayer || selectedFiles.has(name) || selectedStories.has(name),
      ),
      ...[...result.assets.entries()].map(
        ([name, bytes]) => [join('assets', name), bytes] as [string, Uint8Array],
      ),
    ]
    if (!requestedLayer || requestedLayer !== 'theme') planned.push(['styles.css', result.css])
    if (result.geometry && (!requestedLayer || requestedLayer === 'theme')) {
      planned.push(['figma-geometry.json', `${JSON.stringify(result.geometry, null, 2)}\n`])
    }
    if ((!requestedLayer || requestedLayer === 'theme') && result.fontCss)
      planned.push(['fonts.css', result.fontCss])
    if ((!requestedLayer || requestedLayer === 'theme') && result.themeCss)
      planned.push(['tokens.css', result.themeCss])
    if ((!requestedLayer || requestedLayer === 'theme') && result.tokenManifest) {
      planned.push(['tokens.json', `${JSON.stringify(result.tokenManifest, null, 2)}\n`])
    }
    if (result.geometry && requestedLayer && requestedLayer !== 'theme' && selectedFiles.size > 0) {
      planned.push([
        'fidelity.ts',
        "import { expectLayoutWithin as assertWithin } from '@figma-to-react/testing/fidelity'\n" +
          "import geometry from '@ds/theme/figma-geometry.json' with { type: 'json' }\n\n" +
          'export const expectLayoutWithin = (container: HTMLElement, thresholdPx: number) =>\n' +
          '  assertWithin(container, thresholdPx, geometry)\n',
      ])
    }

    // Keep a narrow ownership record: later runs can report files that Figma no
    // longer produces without guessing which files in a package belong to users.
    const outputManifest = '.figma-to-react-output.json'
    const ownedPath = join(outDir, outputManifest)
    const nextFiles = planned.map(([name]) => name)
    try {
      const prior = JSON.parse(await readFile(ownedPath, 'utf8')) as { files?: string[] }
      const stale = (prior.files ?? []).filter(
        (file) => file !== outputManifest && !nextFiles.includes(file),
      )
      if (stale.length)
        console.warn(
          `\nStale generated files (left untouched):\n${stale.map((file) => `  - ${file}`).join('\n')}`,
        )
    } catch {
      // The first run has no ownership baseline.
    }
    planned.push([
      outputManifest,
      `${JSON.stringify({ version: 1, files: [...nextFiles, outputManifest].sort() }, null, 2)}\n`,
    ])

    const changes: string[] = []
    for (const [name, body] of planned) {
      try {
        const previous = await readFile(join(outDir, name))
        const next = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body)
        if (!previous.equals(next)) changes.push(`  ~ ${name}`)
      } catch {
        changes.push(`  + ${name}`)
      }
    }
    if (changes.length) console.log(`\nPlanned changes:\n${changes.join('\n')}`)
    else console.log('\nGenerated output is unchanged.')

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
          "  @import './tokens.css';\n" +
          (result.fontCss
            ? 'fonts.css must come first: a CSS @import is only valid ahead of every other rule.\n'
            : '') +
          'Generated components import their adjacent styles.css automatically.',
      )
    }

    if (opts.designNotes !== false) reportDesign(result.design)
  }
}

withCommonOptions(
  program
    .command('tokens')
    .argument('[figma-url]', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('extract design tokens as a CSS custom-property block')
    .option('-o, --out <file>', 'write to a file instead of stdout')
    .option('--config <file>', 'design-system.json to read the target from', CONFIG_FILE),
).action(async (target: string | undefined, opts) => {
  await withErrorHandling(async () => {
    const config = await readConfig(configFile(opts.config))
    const doc = await fetchIr(resolveTarget(target, config), requireToken(opts.token))
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
    await withErrorHandling(() => runAudit(target, opts))
  })

/** Shared by `audit` and `theme --audit` — the Design Ready gate. */
async function runAudit(
  target: string | undefined,
  opts: { token?: string; config?: string; json?: boolean },
): Promise<void> {
  {
    {
      const config = await readConfig(configFile(opts.config))
      const entry = await fetchEntry(resolveTarget(target, config), requireToken(opts.token))
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
    }
  }
}

withCommonOptions(
  program
    .command('theme-diff')
    .argument('[figma-url]', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('what the theme would gain, lose or change if regenerated')
    .option('-o, --out <dir>', 'directory holding the committed tokens.json')
    .option(
      '--config <file>',
      'design-system.json to read the target and out dir from',
      CONFIG_FILE,
    ),
).action(async (target: string | undefined, opts) => {
  await withErrorHandling(() => runThemeDiff(target, opts))
})

/** Shared by `theme-diff` and `theme --diff` — what belongs in a PR description. */
async function runThemeDiff(
  target: string | undefined,
  opts: { token?: string; config?: string; out?: string; minUses: string },
): Promise<void> {
  {
    const config = await readConfig(configFile(opts.config))
    const outDirName = opts.out ?? outputDirectory(config, 'theme')
    if (!outDirName) {
      throw new Error('No output directory. Pass --out, or set `out` in the config.')
    }
    const outDir = resolve(
      locatedConfig && !opts.out ? join(dirname(locatedConfig), outDirName) : outDirName,
    )
    const path = join(outDir, 'tokens.json')
    let committed: TokenManifest
    try {
      committed = JSON.parse(await readFile(path, 'utf8')) as TokenManifest
    } catch {
      throw new Error(
        `No tokens.json in ${outDirName}. Run gen first — there is nothing to diff against.`,
      )
    }

    const resolved = resolveTarget(target, config)
    const { fileKey, nodeId } = parseFigmaTarget(resolved)
    const doc = await fetchIr(resolved, requireToken(opts.token))
    const fresh = buildTokenManifest(collectTokens(doc, { minUses: Number(opts.minUses) }), {
      key: fileKey,
      ...(nodeId ? { node: nodeId } : {}),
    })

    const diff = diffTokenManifests(committed, fresh)
    if (isEmptyDiff(diff)) {
      console.log(`\nTheme unchanged: ${committed.tokens.length} token(s) still match the design.`)
      return
    }

    console.log('\nTheme changes if regenerated:\n')
    for (const t of diff.added) console.log(`  + ${t.cssVar}: ${t.value}`)
    for (const t of diff.removed) console.log(`  - ${t.cssVar}: ${t.value}`)
    for (const { before, after } of diff.changed) {
      console.log(`  ~ ${after.cssVar}: ${before.value} -> ${after.value}`)
    }
    // Versioning is NX and CI's job, so this reports the change and stops there.
    console.log('\nRun `figma2react theme` to apply.')
  }
}

/**
 * The theme has one command with modes rather than four commands, because the
 * question people actually arrive with is which *stage* they are at, not which
 * verb to type. `tokens.css`, `tokens.json` and the theme story all fall out of
 * one collection pass, so stage 1 is `gen` — same code, named for the stage.
 */
withCommonOptions(
  program
    .command('theme')
    .argument('[figma-url]', 'Figma frame URL, or <fileKey> / <fileKey>:<nodeId>')
    .description('generate the theme; --audit for readiness, --diff for what would change')
    .option('--audit', 'stage 0: is the design file ready to generate a theme from?')
    .option('--diff', 'stage 3: what the theme would gain, lose or change')
    .option('--apply', 'with `theme color`, write the planned generated output')
    .option('--json', 'with --audit, emit the findings as JSON')
    .option('-o, --out <dir>', 'output directory')
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
    .option('--layer <name>', 'generate into a subdirectory of out: atoms | molecules | organisms')
    .option('--dry-run', 'print what would be written without touching the filesystem')
    .option('--config <file>', 'design-system.json to read layers and ownership from', CONFIG_FILE),
).action(async (target: string | undefined, opts, command: Command) => {
  await withErrorHandling(async () => {
    if (target === 'color') return runThemeColor(undefined, opts, command)
    if (opts.audit) return runAudit(target, opts)
    if (opts.diff) return runThemeDiff(target, opts)
    return runGen(target, opts, command)
  })
})

async function runThemeColor(
  target: string | undefined,
  opts: GenOptions,
  command: Command,
): Promise<void> {
  console.log(
    opts.apply
      ? '\nApplying the complete generated output from this design snapshot.'
      : '\nPreview only; add --apply to write the complete generated output.',
  )
  await runGen(
    target,
    { ...opts, dryRun: !opts.apply, requireBoundColours: Boolean(opts.apply) },
    command,
  )
}

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
          opts.out ??
          (await ask('Output directory', outputDirectory(existing, 'atom') ?? 'packages/atoms/src'))

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

// The preAction hook can fail (no fixture to serve, unreadable config), and a
// rejected parseAsync would otherwise surface as an unhandled rejection.
program.parseAsync(process.argv).catch((err) => {
  console.error(`\nerror: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
