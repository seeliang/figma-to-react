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

  it('names greys as greys, not as dark shades of a hue', () => {
    // The bug this guards: #0f172a is a slate, but its HSL saturation is 0.47,
    // which named it `blue-950` and stood it beside a real `blue-600`.
    expect(nameColor('#0f172a')).toMatch(/^slate-/)
    expect(nameColor('#64748b')).toMatch(/^slate-/)
    expect(nameColor('#2563eb')).toMatch(/^blue-/)
  })

  it('keeps the hue of a pale tint instead of flattening it to grey', () => {
    expect(nameColor('#f0fdf4')).toMatch(/^green-/)
    expect(nameColor('#fef2f2')).toMatch(/^red-/)
    // ...while a genuinely neutral near-white stays neutral.
    expect(nameColor('#f8fafc')).toMatch(/^(neutral|slate|gray)-/)
  })

  it('places a colour on the ramp by perceptual lightness, not HSL', () => {
    // Naming targets a readable, stable label rather than an exact reproduction
    // of Tailwind's palette, so assert the step lands within one of the real
    // ramp — the drift HSL produced was two to three steps.
    const step = (css: string) => Number(/-(\d+)$/.exec(nameColor(css))![1])
    const RAMP = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
    const within = (css: string, expected: number) =>
      Math.abs(RAMP.indexOf(step(css)) - RAMP.indexOf(expected)) <= 1

    expect(within('#22c55e', 500)).toBe(true) // green-500
    expect(within('#3b82f6', 500)).toBe(true) // blue-500
    expect(within('#ef4444', 500)).toBe(true) // red-500
    expect(within('#0f172a', 900)).toBe(true) // slate-900
    // Ordering within a ramp must hold: lighter always gets a lower step.
    expect(step('#bfdbfe')).toBeLessThan(step('#3b82f6'))
    expect(step('#3b82f6')).toBeLessThan(step('#1e3a8a'))
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

  it('groups an unnameable variable by value rather than giving it its own token', () => {
    // Variable *names* need the Enterprise-only variables endpoint. Without
    // them, one token per variable id yields `white`, `white-2`, `white-3` for
    // the same colour: identical output, three meaningless names.
    const token = table.tokens.find((t) => t.value === '#2663eb')
    expect(token).toMatchObject({ kind: 'color', name: 'blue-600' })
    expect(token!.sources.map((s) => s.key)).toContain('VariableID:2:9')
    expect(table.tokens.filter((t) => t.value === '#2663eb')).toHaveLength(1)
  })

  it('emits no two tokens holding the same value', () => {
    const values = table.tokens.map((t) => t.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('leaves one-off unnamed colours as literals', () => {
    // The border colour appears once and has no style or variable behind it.
    expect(table.tokens.some((t) => t.value === '#e6e8eb')).toBe(false)
  })

  it('does not invent spacing names Tailwind already covers', () => {
    expect(table.tokens.filter((t) => t.kind === 'spacing')).toHaveLength(0)
  })

  it('resolves through the source, and through the raw value as a fallback', () => {
    const { resolver } = table
    expect(
      resolver.resolve('color', '#ffffff', {
        source: 'style',
        key: 'S:surface',
        name: 'Surface/Raised',
      }),
    ).toBe('surface-raised')
    // A node the designer forgot to bind still lands on the same token rather
    // than emitting a raw hex right beside it.
    expect(resolver.resolve('color', '#ffffff')).toBe('surface-raised')
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
