import { execFile } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const FIXTURES = new URL('../../core/test/fixtures/', import.meta.url)

/**
 * Serves the recorded fixtures as if it were api.figma.com, so the real CLI
 * binary runs its real code path — argument parsing, fetching, writing files —
 * without a token and without a network.
 */
let server: Server
let baseUrl: string

const SVG =
  '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4 6l4 4"/></svg>'

beforeAll(async () => {
  const card = JSON.parse(await readFile(fileURLToPath(new URL('card.json', FIXTURES)), 'utf8'))

  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost')

    if (url.pathname.endsWith('/nodes')) {
      const ids = url.searchParams.get('ids')!.split(',')
      const nodes = Object.fromEntries(ids.map((id) => [id, card.nodes[id] ?? null]))
      return json(res, { name: card.name, lastModified: card.lastModified, nodes })
    }
    if (url.pathname.startsWith('/v1/images/')) {
      const ids = url.searchParams.get('ids')!.split(',')
      return json(res, {
        err: null,
        images: Object.fromEntries(ids.map((id) => [id, `${baseUrl}/asset.svg`])),
      })
    }
    if (url.pathname.endsWith('/images')) {
      return json(res, { error: false, status: 200, meta: { images: {} } })
    }
    if (url.pathname === '/asset.svg') {
      res.writeHead(200, { 'content-type': 'image/svg+xml' })
      return res.end(SVG)
    }
    res.writeHead(404).end('{}')
  })

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

afterAll(() => new Promise<void>((r) => server.close(() => r())))

const json = (res: Parameters<Parameters<typeof createServer>[0]>[1], body: unknown) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

const cli = (args: string[], env: Record<string, string> = {}) =>
  exec(process.execPath, [CLI, ...args], {
    env: { ...process.env, FIGMA_TOKEN: 'test-token', FIGMA_API_BASE: baseUrl, ...env },
  })

describe('figma2react gen', () => {
  it('writes components, a theme file and no stray files', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    const { stdout } = await cli(['gen', 'TESTKEY:1-2', '--out', out])

    // Three views of one theme: `tokens.css` for browsers, `tokens.json` for the
    // generated story and the drift check, and `figma-tokens.md` for a person —
    // the last describing the design rather than what was generated from it.
    expect((await readdir(out)).sort()).toEqual([
      '.figma-to-react-output.json',
      'button-primary.tsx',
      'card.tsx',
      'figma-tokens.json',
      'figma-tokens.md',
      'fonts.css',
      'styles.css',
      'tokens.css',
      'tokens.json',
    ])
    expect(stdout).toContain('root component: <Card />')
  })

  it('inlines the exported SVG as JSX', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out])
    const card = await readFile(join(out, 'card.tsx'), 'utf8')

    expect(card).toContain('<svg')
    expect(card).toContain('fillRule="evenodd"')
    expect(card).not.toContain('data-figma-vector')
  })

  it('uses theme names instead of literal hex once tokens are on', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--min-uses', '2'])

    const card = await readFile(join(out, 'card.tsx'), 'utf8')
    const css = await readFile(join(out, 'styles.css'), 'utf8')

    expect(card).toContain("import './styles.css'")
    expect(css).toContain('var(--color-surface-raised)')
  })

  it('writes a font loader and tells you it must be imported first', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    const { stdout } = await cli(['gen', 'TESTKEY:1-2', '--out', out])

    const fonts = await readFile(join(out, 'fonts.css'), 'utf8')
    expect(fonts).toContain('fonts.googleapis.com')
    expect(fonts).toContain('display=swap')
    // Ordering is not enforceable by the file itself, so the CLI says it too.
    expect(stdout).toContain("@import './fonts.css';")
    expect(stdout).toContain('fonts.css must come first')
  })

  it('skips the font loader on --no-font-import', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--no-font-import'])
    expect(await readdir(out)).not.toContain('fonts.css')
  })

  it('falls back to literal values with --no-tokens', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--no-tokens'])

    const styles = await readFile(join(out, 'styles.css'), 'utf8')
    expect(styles).toContain('background: #ffffff;')
    expect(await readdir(out)).not.toContain('tokens.css')
  })

  it('emits a placeholder, not a crash, when assets are skipped', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--no-assets'])
    expect(await readFile(join(out, 'card.tsx'), 'utf8')).toContain('data-figma-vector')
  })

  it('writes nothing on --dry-run', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    const { stdout } = await cli(['gen', 'TESTKEY:1-2', '--out', out, '--dry-run'])

    expect(stdout).toContain('Would write')
    expect(await readdir(out)).toEqual([])
  })
})

/**
 * The gate that matters most: an emitter that produces TSX which does not
 * compile is worthless, and no amount of snapshot review reliably catches it.
 */
describe('figma2react gen --stories', () => {
  it('writes one story file per variant set, plus the geometry they measure against', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-sb-'))
    const { stdout } = await cli(['gen', 'TESTKEY:1-2', '--out', out, '--stories', '--trace-ids'])

    const files = await readdir(out)
    expect(files).toContain('button.stories.tsx')
    expect(files).toContain('figma-geometry.json')
    // One per variant set, plus the theme's own gallery-and-assertions story.
    expect(files).toContain('theme.stories.tsx')
    expect(stdout).toContain('stories: 2 file(s)')
  })

  it('points each story at its own Figma node', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-sb-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--stories', '--trace-ids'])

    const story = await readFile(join(out, 'button.stories.tsx'), 'utf8')
    expect(story).toContain("type: 'figma'")
    expect(story).toContain('node-id=10-1')
  })

  it('warns that fidelity cannot be measured without --trace-ids', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-sb-'))
    const { stderr } = await cli(['gen', 'TESTKEY:1-2', '--out', out, '--stories'])
    expect(stderr).toContain('without --trace-ids')
  })

  it('writes no stories unless asked', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-'))
    await cli(['gen', 'TESTKEY:1-2', '--out', out])
    expect((await readdir(out)).some((f) => f.endsWith('.stories.tsx'))).toBe(false)
  })
})

describe('generated code compiles', () => {
  it('passes tsc --noEmit under strict mode with no unused locals', async () => {
    const out = await mkdtemp(join(tmpdir(), 'f2r-tsc-'))
    // Stories are included: `satisfies Meta<typeof X>` is real type surface,
    // and it has already caught args that a variant's component cannot accept.
    await cli(['gen', 'TESTKEY:1-2', '--out', out, '--min-uses', '2', '--stories', '--trace-ids'])

    await writeFile(join(out, 'fidelity.d.ts'), FIDELITY_STUB)
    const themeStub = join(out, 'theme.d.ts')
    await writeFile(themeStub, THEME_STUB)

    await writeFile(
      join(out, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
          typeRoots: [],
          baseUrl: '.',
          paths: {
            react: [reactTypes],
            'react/jsx-runtime': [jsxRuntimeTypes],
            '@storybook/react': [storybookTypes],
            '@figma-to-react/testing/theme': [themeStub],
          },
        },
        include: ['*.tsx'],
      }),
    )

    const tsc = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url))
    const { stdout } = await exec(process.execPath, [tsc, '--noEmit', '--project', out]).catch(
      (e) => e as { stdout: string },
    )
    expect(stdout.trim()).toBe('')
  }, 60_000)
})

const reactTypes = fileURLToPath(
  new URL('../../../node_modules/@types/react/index.d.ts', import.meta.url),
)
const jsxRuntimeTypes = fileURLToPath(
  new URL('../../../node_modules/@types/react/jsx-runtime.d.ts', import.meta.url),
)
const storybookTypes = fileURLToPath(
  new URL('../../../node_modules/@storybook/react/dist/index.d.ts', import.meta.url),
)
/**
 * Stories import a generated wrapper beside their components. The standalone
 * generator deliberately does not add that workspace-only wrapper, so this
 * compilation gate supplies its declaration.
 */
const FIDELITY_STUB = `export declare function expectLayoutWithin(
  container: HTMLElement,
  thresholdPx: number,
): Promise<void>
`

const THEME_STUB = `export declare function expectTokensRendered(
  container: HTMLElement,
  expected: readonly { cssVar: string; name: string; value: string; named: boolean; kind: string }[],
): Promise<void>
`

describe('figma2react tokens', () => {
  it('prints a CSS custom-property block to stdout', async () => {
    const { stdout } = await cli(['tokens', 'TESTKEY:1-2', '--min-uses', '2'])
    expect(stdout).toContain(':root {')
    expect(stdout).toContain('--color-surface-raised: #ffffff;')
  })

  it('emits a fragment, not an entry point', async () => {
    const { stdout } = await cli(['tokens', 'TESTKEY:1-2', '--min-uses', '2'])
    // A fragment declares properties and pulls in nothing; an entry point would
    // import. Comments carry the wiring instructions, so only active CSS counts.
    const active = stdout.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(active).not.toContain('@import')
    expect(stdout).toContain('Wire it up from your own stylesheet')
  })

  it('leaves the wiring comment as a valid CSS comment', async () => {
    const { stdout } = await cli(['tokens', 'TESTKEY:1-2'])
    const comment = stdout.slice(stdout.indexOf('/*') + 2, stdout.indexOf('*/'))
    expect(comment).not.toContain('*/')
  })
})

describe('figma2react inspect', () => {
  it('dumps the IR as JSON, with components keyed by id', async () => {
    const { stdout } = await cli(['inspect', 'TESTKEY:1-2'])
    const ir = JSON.parse(stdout)
    expect(ir.root.name).toBe('Card')
    expect(Object.keys(ir.components)).toEqual(['10:1'])
  })

  it('dumps the untouched API response with --raw', async () => {
    const { stdout } = await cli(['inspect', 'TESTKEY:1-2', '--raw'])
    expect(JSON.parse(stdout).nodes['1:2'].document.type).toBe('FRAME')
  })
})

describe('error handling', () => {
  const failed = (args: string[], env: Record<string, string> = {}) =>
    cli(args, env).then(
      (r) => r as { stderr: string },
      (e) => e as { stderr: string },
    )

  it('explains how to get a token when none is set', async () => {
    const { stderr } = await failed(['gen', 'TESTKEY:1-2', '--out', '/tmp/x'], { FIGMA_TOKEN: '' })
    expect(stderr).toContain('No Figma token')
    expect(stderr).toContain('access-tokens')
  })

  it('names the node it could not find', async () => {
    const { stderr } = await failed(['gen', 'TESTKEY:9-9', '--out', '/tmp/x'])
    expect(stderr).toContain('no node 9:9')
  })

  it('rejects a URL with no file key before making any request', async () => {
    const { stderr } = await failed(['gen', 'https://www.figma.com/community', '--out', '/tmp/x'])
    expect(stderr).toContain('Could not find a file key')
  })
})
