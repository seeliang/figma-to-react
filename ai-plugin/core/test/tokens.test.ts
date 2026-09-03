import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FileNodesResponse } from '../src/figma/types.js'
import { normalize } from '../src/ir/normalize.js'
import { collectTokens, nameColor, slugify } from '../src/tokens/collect.js'
import { emitFontCss, emitThemeCss, googleFontsUrl } from '../src/tokens/emit.js'
import { buildTokenManifest, diffTokenManifests, isEmptyDiff } from '../src/tokens/manifest.js'

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

describe('typefaces', () => {
  const table = collectTokens(docFor('card', '1:2'), { minUses: 2 })

  it('emits a font token with a fallback stack, not a bare family', () => {
    const font = table.tokens.find((t) => t.kind === 'fontFamily')
    expect(font).toMatchObject({ name: 'inter' })
    expect(font!.value).toBe('Inter, ui-sans-serif, system-ui, sans-serif')
  })

  it('never drops a typeface for being infrequent', () => {
    // A family used once still has to be declared somewhere.
    expect(collectTokens(docFor('card', '1:2'), { minUses: 99 }).tokens).toContainEqual(
      expect.objectContaining({ kind: 'fontFamily' }),
    )
  })

  it('puts typefaces in their own @theme group', () => {
    expect(emitThemeCss(table)).toContain(
      '--font-inter: Inter, ui-sans-serif, system-ui, sans-serif;',
    )
  })
})

describe('font loading', () => {
  const table = collectTokens(docFor('card', '1:2'), { minUses: 2 })

  it('requests exactly the weights the design draws in, and no others', () => {
    const css = emitFontCss(table.fonts)
    expect(css).toContain('family=Inter:wght@400;500;600')
    expect(css).not.toContain('100')
    expect(css).not.toContain('900')
  })

  it('asks for display=swap so text is readable before the font lands', () => {
    expect(emitFontCss(table.fonts)).toContain('display=swap')
  })

  it('keeps the import out of the theme file, where a bundler would drop it', () => {
    // A CSS @import is only valid ahead of every other rule. Inside the theme
    // file it lands mid-bundle once inlined, and is silently discarded.
    expect(emitThemeCss(table)).not.toContain('fonts.googleapis')
  })

  it('says the import must come first, since nothing else enforces it', () => {
    expect(emitFontCss(table.fonts)).toContain('BEFORE anything else')
  })

  it('escapes spaces in a family name', () => {
    expect(
      googleFontsUrl([{ family: 'Source Serif 4', styles: [{ weight: 400, italic: false }] }]),
    ).toContain('family=Source+Serif+4')
  })

  it('requests italics only when the design uses them', () => {
    const roman = googleFontsUrl([{ family: 'Inter', styles: [{ weight: 400, italic: false }] }])
    expect(roman).toContain('wght@400')
    expect(roman).not.toContain('ital')

    const italic = googleFontsUrl([
      {
        family: 'Inter',
        styles: [
          { weight: 400, italic: false },
          { weight: 400, italic: true },
        ],
      },
    ])
    expect(italic).toContain('ital,wght@0,400;1,400')
  })

  it('emits nothing when the design names no typeface', () => {
    expect(emitFontCss([])).toBe('')
    expect(googleFontsUrl([])).toBe('')
  })
})

describe('emitThemeCss', () => {
  it('emits a plain CSS custom-property block with rem lengths', () => {
    const table = collectTokens(docFor('card', '1:2'), { minUses: 2 })
    const css = emitThemeCss(table)
    expect(css).toContain(':root {')
    expect(css).not.toContain('tailwindcss')
    expect(css).toContain('--color-surface-raised: #ffffff;')
  })

  it('explains itself when a file carries no tokens at all', () => {
    const table = collectTokens(docFor('legacy', '2:1'))
    expect(emitThemeCss(table)).toContain('No design tokens found')
  })
})

/**
 * What the naming actually promises.
 *
 * Not "the name agrees with Tailwind" — this design system is hand-tailored and
 * Tailwind's ramp is not the target. What it does promise is that the same
 * colour always produces the same name, and that two colours never end up
 * sharing one, because a collision silently merges two design decisions.
 */
describe('token naming: stable and unique', () => {
  const source = { key: 'uA3bE5ofr6BgRakJzudL4L', node: '2:77' }
  const manifest = () => buildTokenManifest(collectTokens(docFor('design-system', '2:77')), source)

  it('produces identical output for identical input', () => {
    expect(diffTokenManifests(manifest(), manifest())).toSatisfy(isEmptyDiff)
  })

  it('gives every token a distinct custom property', () => {
    const vars = manifest().tokens.map((t) => t.cssVar)
    expect(new Set(vars).size).toBe(vars.length)
  })

  it('never emits two different values under one name', () => {
    const byVar = new Map<string, string>()
    for (const t of manifest().tokens) {
      expect(byVar.get(t.cssVar) ?? t.value).toBe(t.value)
      byVar.set(t.cssVar, t.value)
    }
  })

  it('counts each kind, so a generated test can assert the number', () => {
    expect(manifest().counts).toEqual({ color: 7, fontFamily: 1 })
  })

  it('marks a token as named only when a Figma Style supplied the name', () => {
    // Every colour in this file is unbound, so every name is derived. That is
    // the design issue the theme flow exists to surface, asserted rather than
    // assumed.
    expect(manifest().tokens.every((t) => !t.named)).toBe(true)
  })

  it('reports a changed value as changed, not as add plus remove', () => {
    const before = manifest()
    const after = structuredClone(before)
    after.tokens[0]!.value = '#000000'
    const diff = diffTokenManifests(before, after)
    expect(diff.changed).toHaveLength(1)
    expect([diff.added, diff.removed]).toEqual([[], []])
  })
})
