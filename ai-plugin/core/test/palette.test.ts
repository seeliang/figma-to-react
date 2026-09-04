import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FigmaNode, FileNodesResponse } from '../src/figma/types.js'
import { nameOf, readPalette } from '../src/tokens/palette.js'

function documentFor(file: string, nodeId: string): FigmaNode {
  const response: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${file}.json`, import.meta.url)), 'utf8'),
  )
  return response.nodes[nodeId]!.document
}

const palette = () => readPalette(documentFor('design-system', '2:77'))!

describe('reading the palette a file documents', () => {
  it('finds every documented swatch', () => {
    expect(palette().swatches).toHaveLength(11)
  })

  it('keeps the design’s own grouping and order, which carry meaning', () => {
    // Alphabetical order is order by a *derived* name the design never chose.
    expect(palette().groups.map((g) => g.name)).toEqual(['PRIMARY', 'NEUTRALS', 'SEMANTIC'])
    expect(palette().groups[0]!.values).toEqual(['#2563eb', '#ffffff'])
  })

  it('ships the name the design displays, not the hidden layer name', () => {
    // This cell displays `Neutral-0f` and sits on a layer called `Foreground`.
    // The displayed label wins: it is the name the design actually presents.
    // `Foreground` would be the better token name, but reaching past the label
    // to find it would hide a naming problem that belongs in Figma.
    const cell = palette().swatches.find((s) => s.value === '#0f172a')!
    expect(cell.layerName).toBe('Foreground')
    expect(nameOf(cell)).toBe('Neutral-0f')
  })

  it('names a bound swatch by id, which cannot be wrong', () => {
    expect(palette().names['VariableID:61:16']).toBe('Error')
  })

  it('names the value even when several variables render it', () => {
    // The palette documents `#2563eb` once, as Primary. That a second Variable
    // also renders the hex makes that Variable undocumented — it does not make
    // the design's own label for the colour wrong. Refusing here is what
    // produced `--color-blue-600` for a colour the file plainly calls Primary.
    expect(palette().byValue['#2563eb']).toBe('Primary')
    expect(palette().ambiguous.map((a) => a.value)).toContain('#2563eb')
  })

  it('refuses to name when two variables render one value', () => {
    // `#2563eb` is documented once, as Primary — but two variables render it,
    // and one of them is the focus ring. Naming it would ship `primary` on a
    // colour that is not primary, and nothing downstream could tell.
    const names = Object.values(palette().names)
    expect(names).not.toContain('Primary')
    expect(palette().ambiguous.map((a) => a.value)).toContain('#2563eb')
  })

  it('keeps two swatches that share a value as two separate decisions', () => {
    // `Primary Foreground` and `Neutral-ff` are both white and are two design
    // decisions, not one. Collapsing them loses a token the design declared —
    // and they must diverge the moment there is a dark mode.
    const white = palette().swatches.filter((s) => s.value === '#ffffff')
    expect(white.map(nameOf)).toEqual(['Primary Foreground', 'Neutral-ff'])
    expect(white.map((s) => s.group)).toEqual(['PRIMARY', 'NEUTRALS'])

    // Still reported: a raw use of the value cannot say which one it meant.
    const found = palette().ambiguous.find((a) => a.names.length > 1)!
    expect(found.value).toBe('#ffffff')
    expect(found.names).toEqual(['Primary Foreground', 'Neutral-ff'])
  })

  it('states the evidence for every refusal, so a person can act on it', () => {
    for (const a of palette().ambiguous) {
      expect(a.reason).toBeTruthy()
      expect(a.names.length).toBeGreaterThan(0)
    }
  })

  it('names a colour no variable binds, so frequency tokens get a real name too', () => {
    // `#64748b` is bound nowhere, but the palette still names it. The label is
    // hex-derived, so the token is `--color-neutral-64` — no better than the
    // `slate-600` it replaces. Faithful to the design, and a design issue.
    expect(palette().byValue['#64748b']).toBe('Neutral-64')
  })

  it('records a flattened swatch, whose binding cannot reach a token', () => {
    const error = palette().swatches.find((s) => s.value === '#ef4444')!
    expect(error.flattened).toBe(true)
    expect(error.variable).toBe('VariableID:61:16')
  })

  it('returns nothing for a file that documents no palette', () => {
    expect(readPalette(documentFor('card', '1:2'))).toBeUndefined()
  })
})

describe('the design’s own structure survives into the theme', () => {
  it('keeps the palette’s title, which the frame name carries', () => {
    expect(palette().title).toBe('Color Palette')
  })

  it('numbers swatches in document order, so the theme can be presented as designed', () => {
    // Without an order the theme is sorted by name or by usage, and the output
    // stops resembling the palette it came from.
    const order = palette().swatches.map((s) => s.index)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(palette().swatches[0]!.group).toBe('PRIMARY')
    expect(palette().swatches.at(-1)!.group).toBe('SEMANTIC')
  })
})
