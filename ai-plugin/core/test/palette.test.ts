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

  it('prefers the cell’s layer name over the text it displays', () => {
    // The layer is called `Foreground`; it displays `Neutral-0f`. The role is
    // the one worth shipping — `--color-neutral-0f` says no more than the
    // derived name it would replace.
    const cell = palette().swatches.find((s) => s.value === '#0f172a')!
    expect(cell.label).toBe('Neutral-0f')
    expect(nameOf(cell)).toBe('Foreground')
  })

  it('names a bound swatch by id, which cannot be wrong', () => {
    expect(palette().names['VariableID:61:16']).toBe('Error')
  })

  it('names an unbound swatch by value when exactly one variable holds it', () => {
    expect(palette().names['VariableID:2:37']).toBe('Border')
  })

  it('refuses to name when two variables render one value', () => {
    // `#2563eb` is documented once, as Primary — but two variables render it,
    // and one of them is the focus ring. Naming it would ship `primary` on a
    // colour that is not primary, and nothing downstream could tell.
    const names = Object.values(palette().names)
    expect(names).not.toContain('Primary')
    expect(palette().ambiguous.map((a) => a.value)).toContain('#2563eb')
  })

  it('refuses to name when two swatches document one value', () => {
    const names = Object.values(palette().names)
    expect(names).not.toContain('Background')
    expect(names).not.toContain('Primary Foreground')
    const found = palette().ambiguous.find((a) => a.value === '#ffffff')!
    expect(found.names).toEqual(['Primary Foreground', 'Background'])
  })

  it('states the evidence for every refusal, so a person can act on it', () => {
    for (const a of palette().ambiguous) {
      expect(a.reason).toBeTruthy()
      expect(a.names.length).toBeGreaterThan(0)
    }
  })

  it('names a colour no variable binds, so frequency tokens get a real name too', () => {
    // `#64748b` is used 17 times and bound nowhere; the palette still calls it
    // `Muted`, and that beats the derived `slate-600`.
    expect(palette().byValue['#64748b']).toBe('Muted')
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
