import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FileNodesResponse } from '../src/figma/types.js'
import { normalize } from '../src/ir/normalize.js'
import { collectTokens, nameColor, slugify } from '../src/tokens/collect.js'
import { emitThemeCss } from '../src/tokens/emit.js'

function docFor(file: string, nodeId: string) {
  const response: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${file}.json`, import.meta.url)), 'utf8'),
  )
  const entry = response.nodes[nodeId]!
  return normalize({
    fileKey: 'TEST',
    document: entry.document,
    components: entry.components,
    componentSets: entry.componentSets,
    styles: entry.styles,
  })
}

describe('slugify', () => {
  it('turns Figma style paths into theme keys', () => {
    expect(slugify('Surface/Raised')).toBe('surface-raised')
    expect(slugify('Heading / Small')).toBe('heading-small')
    expect(slugify('brandPrimary')).toBe('brand-primary')
  })
})

describe('nameColor', () => {
  it('names colours deterministically from their own HSL', () => {
    expect(nameColor('#2663eb')).toBe('blue-600')
    expect(nameColor('#2663eb')).toBe(nameColor('#2663eb'))
  })

  it('recognises achromatic colours', () => {
    expect(nameColor('#ffffff')).toBe('white')
    expect(nameColor('#000000')).toBe('black')
    expect(nameColor('#7a7a7a')).toMatch(/^neutral-\d+$/)
  })

  it('reads rgba as well as hex', () => {
    expect(nameColor('rgba(38, 99, 235, 0.5)')).toBe('blue-600')
  })
})

describe('collectTokens', () => {
  const table = collectTokens(docFor('card', '1:2'), { minUses: 2 })
  const named = (name: string) => table.tokens.find((t) => t.name === name)

  it('names tokens from Figma styles when a style name exists', () => {
    expect(named('surface-raised')).toMatchObject({ kind: 'color', value: '#ffffff' })
    expect(named('heading-small')).toMatchObject({ kind: 'color', value: '#0f1729' })
  })

  it('groups a bound variable under one synthetic name', () => {
    const token = table.tokens.find((t) => t.source?.source === 'variable')
    expect(token).toMatchObject({ kind: 'color', name: 'blue-600', value: '#2663eb' })
  })

  it('leaves one-off unnamed colours as literals', () => {
    // The border colour appears once and has no style or variable behind it.
    expect(table.tokens.some((t) => t.value === '#e6e8eb')).toBe(false)
  })

  it('does not invent spacing names Tailwind already covers', () => {
    expect(table.tokens.filter((t) => t.kind === 'spacing')).toHaveLength(0)
  })

  it('resolves a value back to its theme name only via its own source', () => {
    const { resolver } = table
    expect(
      resolver.resolve('color', '#ffffff', {
        source: 'style',
        key: 'S:surface',
        name: 'Surface/Raised',
      }),
    ).toBe('surface-raised')
    // Same colour, no token: must not borrow the named token's name.
    expect(resolver.resolve('color', '#ffffff')).toBeUndefined()
  })
})

describe('emitThemeCss', () => {
  it('emits a Tailwind v4 @theme block with rem lengths', () => {
    const table = collectTokens(docFor('card', '1:2'), { minUses: 2 })
    const css = emitThemeCss(table, { includeImport: true })
    expect(css).toContain("@import 'tailwindcss';")
    expect(css).toContain('@theme {')
    expect(css).toContain('--color-surface-raised: #ffffff;')
  })

  it('explains itself when a file carries no tokens at all', () => {
    const table = collectTokens(docFor('legacy', '2:1'))
    expect(emitThemeCss(table)).toContain('No design tokens found')
  })
})
