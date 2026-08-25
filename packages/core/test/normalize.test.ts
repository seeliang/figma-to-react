import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FileNodesResponse } from '../src/figma/types.js'
import { normalize, walk } from '../src/ir/normalize.js'
import type { IRNode } from '../src/ir/types.js'

const fixture = (name: string): FileNodesResponse =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'),
  )

function irFor(file: string, nodeId: string) {
  const entry = fixture(file).nodes[nodeId]!
  return normalize({
    fileKey: 'TEST',
    document: entry.document,
    components: entry.components,
    componentSets: entry.componentSets,
    styles: entry.styles,
  })
}

const byId = (root: IRNode, id: string): IRNode => {
  let found: IRNode | undefined
  walk(root, (n) => {
    if (n.id === id) found = n
  })
  if (!found) throw new Error(`No IR node ${id}`)
  return found
}

describe('normalize: auto layout', () => {
  const { root } = irFor('card', '1:2')

  it('maps a vertical auto-layout frame to a flex column', () => {
    expect(root.layout.mode).toBe('flex')
    expect(root.layout.direction).toBe('column')
    expect(root.layout.gap?.px).toBe(16)
    expect(root.layout.padding?.top.px).toBe(24)
    expect(root.layout.align).toBe('start')
  })

  it('carries the measurement alongside every sizing kind', () => {
    // A replaced element such as <input> ignores content sizing, so a hugging
    // node still needs its measured width available to the emitter.
    expect(root.layout.height).toMatchObject({ kind: 'hug', px: expect.any(Number) })
  })

  it('reads modern layoutSizing over the bounding box', () => {
    expect(root.layout.width).toEqual({ kind: 'fixed', px: 320 })
    expect(root.layout.height).toMatchObject({ kind: 'hug' })
    expect(byId(root, '1:3').layout.width).toMatchObject({ kind: 'fill' })
  })

  it('maps SPACE_BETWEEN and CENTER alignment', () => {
    const header = byId(root, '1:3')
    expect(header.layout.direction).toBe('row')
    expect(header.layout.justify).toBe('between')
    expect(header.layout.align).toBe('center')
  })

  it('omits justify for MIN, which is already flexbox default', () => {
    expect(root.layout.justify).toBeUndefined()
  })
})

describe('normalize: style', () => {
  const { root } = irFor('card', '1:2')

  it('converts 0-1 float colours to hex', () => {
    expect(root.box.fill).toEqual({
      kind: 'solid',
      color: {
        css: '#ffffff',
        token: { source: 'style', key: 'S:surface', name: 'Surface/Raised' },
      },
    })
  })

  it('reads border, uniform corners and drop shadow', () => {
    expect(root.box.border).toMatchObject({ width: 1, style: 'solid', color: { css: '#e6e8eb' } })
    expect(root.box.corners?.topLeft.px).toBe(8)
    expect(root.box.shadows).toEqual([
      { inset: false, x: 0, y: 2, blur: 8, spread: 0, color: { css: 'rgba(0, 0, 0, 0.08)' } },
    ])
    expect(root.box.clip).toBe(true)
  })

  it('resolves percentage line height against font size', () => {
    const body = byId(root, '1:6')
    expect(body.text?.fontSize?.px).toBe(14)
    // 142.857% of 14px
    expect(body.text?.lineHeightPx).toBe(20)
  })

  it('carries the text style name as a token', () => {
    expect(byId(root, '1:4').text?.color?.token).toMatchObject({ name: 'Heading/Small' })
  })

  it('keeps a bound variable id as a grouping key when no style name exists', () => {
    expect(byId(root, '1:7').box.fill).toMatchObject({
      kind: 'solid',
      color: { token: { source: 'variable', key: 'VariableID:2:9' } },
    })
  })
})

describe('normalize: node classification', () => {
  const card = irFor('card', '1:2')
  const legacy = irFor('legacy', '3:1')

  it('drops invisible layers', () => {
    expect(() => byId(card.root, '1:9')).toThrow()
  })

  it('drops masks', () => {
    expect(() => byId(legacy.root, '3:3')).toThrow()
  })

  it('marks vectors for SVG export and strips their fill', () => {
    const icon = byId(card.root, '1:5')
    expect(icon.kind).toBe('vector')
    expect(icon.asset).toEqual({ kind: 'svg', ref: '1:5' })
    expect(icon.box.fill).toBeUndefined()
  })

  it('treats an all-vector group as one icon and does not walk into it', () => {
    const star = byId(legacy.root, '3:5')
    expect(star.kind).toBe('vector')
    expect(star.children).toHaveLength(0)
  })

  it('records instances once, keyed by component id, with the component name', () => {
    const button = byId(card.root, '1:7')
    expect(button.kind).toBe('instance')
    expect(button.component).toMatchObject({ id: '10:1', name: 'Button/Primary' })
    expect([...card.components.keys()]).toEqual(['10:1'])
  })

  it('keeps the variant set apart from the variant, not just the joined name', () => {
    // A Storybook title is the set and the story export is the variant, so the
    // flattened `Input Field Default` alone cannot be taken apart again:
    // neither the set nor the variant name is guaranteed free of spaces.
    const doc = irFor('variants', '5:1')
    const variants = [...doc.components.values()].map((n) => n.component)
    expect(variants).toEqual([
      { id: '5:2', name: 'Input Field Default', set: 'Input Field', variant: 'Default' },
      { id: '5:3', name: 'Input Field Error', set: 'Input Field', variant: 'Error' },
    ])
  })

  it('leaves set and variant unset for a component outside any set', () => {
    const doc = irFor('variants', '5:10')
    const [only] = [...doc.components.values()]
    expect(only!.component).toEqual({ id: '5:11', name: 'Form Field' })
  })

  it('classifies image-filled leaves as images', () => {
    const photo = byId(legacy.root, '3:4')
    expect(photo.kind).toBe('image')
    expect(photo.asset).toEqual({ kind: 'image', ref: 'ref-abc' })
  })
})

describe('normalize: shape', () => {
  it('marks an ellipse, whose roundness is its node type and not a radius', () => {
    const { root } = irFor('legacy', '4:1')
    expect(byId(root, '4:2').box.shape).toBe('ellipse')
    expect(byId(root, '4:2').box.corners).toBeUndefined()
  })
})

describe('normalize: legacy files without layoutSizing', () => {
  const { root } = irFor('legacy', '2:1')

  it('infers FILL from layoutGrow on the main axis', () => {
    expect(byId(root, '2:2').layout.width).toMatchObject({ kind: 'fill' })
    expect(byId(root, '2:2').layout.grow).toBe(true)
  })

  it('infers FILL from layoutAlign STRETCH on the cross axis', () => {
    const stretched = byId(root, '2:3')
    expect(stretched.layout.height).toMatchObject({ kind: 'fill' })
    expect(stretched.layout.alignSelf).toBe('stretch')
  })

  it('infers HUG from counterAxisSizingMode AUTO', () => {
    expect(root.layout.height).toMatchObject({ kind: 'hug' })
    expect(root.layout.width).toEqual({ kind: 'fixed', px: 400 })
  })
})

describe('normalize: absolute positioning fallback', () => {
  const { root } = irFor('legacy', '3:1')

  it('offsets children against the parent origin when the parent has no layout', () => {
    expect(root.layout.mode).toBe('none')
    expect(byId(root, '3:2').layout.position).toEqual({ x: 20, y: 20 })
  })

  it('multiplies node opacity and paint opacity independently', () => {
    const floating = byId(root, '3:2')
    expect(floating.box.opacity).toBe(0.5)
    expect(floating.box.fill).toMatchObject({ color: { css: 'rgba(0, 0, 0, 0.5)' } })
  })

  it('converts a linear gradient to a CSS angle', () => {
    expect(root.box.fill).toEqual({
      kind: 'gradient',
      css: 'linear-gradient(180deg, #ff0000 0%, #0000ff 100%)',
    })
  })

  it('keeps per-corner radii when they differ', () => {
    expect(root.box.corners).toMatchObject({
      topLeft: { px: 8 },
      topRight: { px: 8 },
      bottomRight: { px: 0 },
      bottomLeft: { px: 0 },
    })
  })
})
