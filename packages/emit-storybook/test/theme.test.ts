import { describe, expect, it } from 'vitest'
import type { TokenManifest } from '@figma-to-react/core'
import { emitThemeStory } from '../src/theme.js'

const manifest = (over: Partial<TokenManifest> = {}): TokenManifest => ({
  figma: { key: 'K', node: '1:1' },
  counts: { color: 2, fontFamily: 1 },
  fonts: [{ family: 'Inter', styles: [{ weight: 400, italic: false }] }],
  tokens: [
    {
      kind: 'color',
      name: 'primary',
      cssVar: '--color-primary',
      value: '#2563eb',
      uses: 9,
      named: true,
      sources: [{ source: 'style', key: 'S:1', name: 'Primary' }],
    },
    {
      kind: 'color',
      name: 'blue-200',
      cssVar: '--color-blue-200',
      value: '#e2e8f0',
      uses: 4,
      named: false,
      sources: [],
    },
    {
      kind: 'fontFamily',
      name: 'inter',
      cssVar: '--font-inter',
      value: 'Inter, sans-serif',
      uses: 12,
      named: false,
      sources: [],
    },
  ],
  ...over,
})

describe('emitThemeStory', () => {
  it('writes one story per token kind', () => {
    const { source } = emitThemeStory(manifest())
    expect(source).toContain('export const Colours: Story')
    expect(source).toContain('export const Typefaces: Story')
    expect(source).not.toContain('export const Spacing: Story')
  })

  it('carries every token into the args, so the count is the design’s not the test author’s', () => {
    const { source } = emitThemeStory(manifest())
    for (const cssVar of ['--color-primary', '--color-blue-200', '--font-inter']) {
      expect(source).toContain(`cssVar: '${cssVar}'`)
    }
  })

  it('asserts against its own args rather than against the page', () => {
    const { source } = emitThemeStory(manifest())
    expect(source).toContain('await expectTokensRendered(canvasElement, args.tokens ?? [])')
  })

  it('omits the play function when assertions are off', () => {
    const { source } = emitThemeStory(manifest(), { assert: false })
    expect(source).not.toContain('expectTokensRendered')
  })

  it('says how many names the generator had to derive', () => {
    // The stage-0 signal, visible in the story rather than only in the audit.
    expect(emitThemeStory(manifest()).source).toContain('2 of 3 tokens carry a name')
  })

  it('renders full width, because the global preview centres stories', () => {
    expect(emitThemeStory(manifest()).source).toContain("layout: 'fullscreen'")
  })
})
