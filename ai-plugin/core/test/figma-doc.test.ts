import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FigmaNode, FileNodesResponse } from '../src/figma/types.js'
import { normalize } from '../src/ir/normalize.js'
import { collectTokens } from '../src/tokens/collect.js'
import { buildTokenManifest } from '../src/tokens/manifest.js'
import { collectFigmaTokens, emitFigmaTokenDoc } from '../src/tokens/figma-doc.js'
import { nameOf, readPalette } from '../src/tokens/palette.js'

function documentFor(file: string, nodeId: string): FigmaNode {
  const response: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${file}.json`, import.meta.url)), 'utf8'),
  )
  return response.nodes[nodeId]!.document
}

const doc = () => {
  const document = documentFor('design-system', '2:77')
  return emitFigmaTokenDoc(document, readPalette(document), { key: 'TESTKEY', node: '2:77' })
}

describe('the Figma token document', () => {
  it('carries no reference to the implementation, which is the whole point', () => {
    // It records the design. The moment a custom property or an output filename
    // appears, it stops being a record of the input and starts duplicating the
    // output — which is exactly the document that cannot explain a token the
    // design defines and the generator drops.
    const text = doc()
    for (const leak of ['--color-', '--radius-', '--font-', 'tokens.css', 'tokens.json', ':root'])
      expect(text).not.toContain(leak)
  })

  it('lists every documented swatch under the design’s own headings', () => {
    const text = doc()
    expect(text).toContain('### PRIMARY')
    expect(text).toContain('### NEUTRALS')
    expect(text).toContain('### SEMANTIC')
    for (const name of ['Primary', 'Neutral-0f', 'Neutral-ff', 'Error', 'Success', 'Warning'])
      expect(text).toContain(name)
  })

  it('names the colour by what the swatch displays', () => {
    // The cell displays `Neutral-0f`; its layer is called `Foreground`. This
    // document shows the design, so it shows the label.
    expect(doc()).toContain('Neutral-0f')
    expect(doc()).not.toContain('| Foreground |')
  })

  it('flags a swatch flattened to a vector, whose binding cannot reach a token', () => {
    expect(doc()).toMatch(/Error.*VariableID:61:16.*flattened to a vector/)
  })

  it('flags two swatches sharing one value, which cannot be told apart', () => {
    expect(doc()).toMatch(/Primary Foreground.*shares its value with Neutral-ff/)
  })

  it('reports spacing defined but never applied, with the frame count as evidence', () => {
    // The scale exists in the file and is bound to nothing. A frame looks
    // correct either way, so this is invisible from inside Figma.
    expect(doc()).toMatch(/No spacing is bound to a Variable\*\*, across \d+ auto-layout frame/)
  })

  it('reports whether each type combination has its size bound', () => {
    expect(doc()).toContain('Size bound')
    expect(doc()).toContain('| Inter | 700 | 28/34 | **no** |')
  })

  it('says so plainly when a file documents no palette', () => {
    const document = documentFor('card', '1:2')
    const text = emitFigmaTokenDoc(document, readPalette(document), { key: 'TESTKEY' })
    expect(text).toContain('documents no colour palette')
  })
})

describe('the theme covers the design', () => {
  // The point of a machine-readable record of the *design* is that the *output*
  // can be asserted against it. Without this, a colour the file documents can
  // stop reaching the theme and nothing fails — which is how the Error swatch
  // went missing: bound correctly, flattened to a vector, silently dropped.
  const built = () => {
    const document = documentFor('design-system', '2:77')
    const palette = readPalette(document)!
    const design = collectFigmaTokens(document, palette, { key: 'TESTKEY', node: '2:77' })
    const ir = normalize({ fileKey: 'TESTKEY', document, variables: palette.names })
    const table = collectTokens(ir, {
      minUses: 3,
      colorNames: palette.byValue,
      colorSwatches: palette.swatches.map((s) => ({
        name: nameOf(s),
        value: s.value,
        ...(s.group ? { group: s.group } : {}),
        order: s.index,
      })),
    })
    return { design, table }
  }

  it('emits one colour token for every colour the design documents', () => {
    const { design, table } = built()
    const colours = table.tokens.filter((t) => t.kind === 'color')
    expect(colours).toHaveLength(design.colours.length)
  })

  it('emits a token for a swatch even when it is flattened to a vector', () => {
    // A flattened swatch exports as SVG, so its fill never reaches the IR. The
    // palette declares it regardless, and a declaration earns a token.
    const { design, table } = built()
    const flattened = design.colours.find((c) => c.flattened)!
    expect(flattened.name).toBe('Error')
    expect(table.tokens.some((t) => t.value === flattened.value)).toBe(true)
  })

  it('keeps every documented value, including two swatches that share one', () => {
    const { design, table } = built()
    for (const colour of design.colours) {
      expect(table.tokens.some((t) => t.kind === 'color' && t.value === colour.value)).toBe(true)
    }
    const whites = table.tokens.filter((t) => t.kind === 'color' && t.value === '#ffffff')
    expect(whites).toHaveLength(2)
  })

  it('carries the design’s grouping and order onto every colour token', () => {
    // The table itself is ordered by priority; the design's order is applied
    // when the manifest and the stylesheet are built. What matters here is that
    // every token knows where the design puts it.
    const { design, table } = built()
    for (const colour of design.colours) {
      const token = table.tokens.find((t) => t.kind === 'color' && t.order === colour.order)
      expect(token, `no token at design order ${colour.order} (${colour.name})`).toBeDefined()
      expect(token!.group).toBe(colour.group)
    }
  })

  it('builds a manifest in the design’s order, not alphabetically', () => {
    const { design, table } = built()
    const manifest = buildTokenManifest(table, { key: 'TESTKEY' })
    const orders = manifest.tokens.filter((t) => t.kind === 'color').map((t) => t.order)
    expect(orders).toEqual(design.colours.map((c) => c.order))
  })
})
