import { describe, expect, it, vi } from 'vitest'
import { FigmaClient } from '../src/figma/client.js'
import { resolveAssets, svgToJsx } from '../src/ir/assets.js'
import type { IRDocument, IRNode } from '../src/ir/types.js'

const FIGMA_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
<!-- exported from Figma -->
<path fill-rule="evenodd" clip-rule="evenodd" d="M4 6l4 4 4-4" stroke-width="1.5" stroke-linecap="round" class="icon"/>
</svg>`

describe('svgToJsx', () => {
  const jsx = svgToJsx(FIGMA_SVG)

  it('camelCases hyphenated SVG attributes', () => {
    expect(jsx).toContain('fillRule="evenodd"')
    expect(jsx).toContain('clipRule="evenodd"')
    expect(jsx).toContain('strokeWidth="1.5"')
    expect(jsx).toContain('strokeLinecap="round"')
  })

  it('renames class to className', () => {
    expect(jsx).toContain('className="icon"')
    expect(jsx).not.toMatch(/\sclass=/)
  })

  it('strips the XML declaration and comments, which JSX cannot parse', () => {
    expect(jsx).not.toContain('<?xml')
    expect(jsx).not.toContain('<!--')
  })

  it('drops intrinsic width and height so CSS controls the size', () => {
    expect(jsx).not.toContain('width="16"')
    expect(jsx).not.toContain('height="16"')
    expect(jsx).toContain('viewBox="0 0 16 16"')
  })

  it('leaves xmlns and path data untouched', () => {
    expect(jsx).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(jsx).toContain('d="M4 6l4 4 4-4"')
  })

  it('does not rewrite hyphens inside data- and aria- attributes', () => {
    expect(svgToJsx('<svg data-foo-bar="1" aria-hidden="true"></svg>')).toContain(
      'data-foo-bar="1" aria-hidden="true"',
    )
  })
})

// ---------------------------------------------------------------------------

const leaf = (id: string, asset: IRNode['asset']): IRNode => ({
  id,
  name: id,
  kind: asset?.kind === 'svg' ? 'vector' : 'image',
  layout: {
    mode: 'none',
    wrap: false,
    width: { kind: 'hug' },
    height: { kind: 'hug' },
    grow: false,
  },
  box: { shadows: [], clip: false },
  asset,
  children: [],
})

function docWith(children: IRNode[]): IRDocument {
  return {
    fileKey: 'KEY',
    components: new Map(),
    root: {
      id: 'root',
      name: 'Root',
      kind: 'box',
      layout: {
        mode: 'none',
        wrap: false,
        width: { kind: 'hug' },
        height: { kind: 'hug' },
        grow: false,
      },
      box: { shadows: [], clip: false },
      children,
    },
  }
}

describe('resolveAssets', () => {
  it('inlines exported SVG markup onto the vector node', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/v1/images/')) {
        return new Response(JSON.stringify({ err: null, images: { '1:5': 'https://cdn/1-5.svg' } }))
      }
      return new Response(FIGMA_SVG)
    })
    const doc = docWith([leaf('1:5', { kind: 'svg', ref: '1:5' })])
    const result = await resolveAssets(
      doc,
      new FigmaClient({ token: 't', fetch: fetchImpl as never }),
    )

    expect(doc.root.children[0]!.asset!.svg).toContain('fillRule="evenodd"')
    expect(result.failed).toEqual([])
  })

  it('records a failure rather than throwing when Figma cannot render a node', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ err: null, images: { '1:5': null } })),
    )
    const doc = docWith([leaf('1:5', { kind: 'svg', ref: '1:5' })])
    const result = await resolveAssets(
      doc,
      new FigmaClient({ token: 't', fetch: fetchImpl as never }),
    )

    expect(result.failed).toEqual(['1:5'])
    expect(doc.root.children[0]!.asset!.svg).toBeUndefined()
  })

  it('downloads raster fills once per ref and names them by content type', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/images')) {
        return new Response(
          JSON.stringify({
            error: false,
            status: 200,
            meta: { images: { 'ref-a': 'https://cdn/a' } },
          }),
        )
      }
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    })
    const doc = docWith([
      leaf('3:4', { kind: 'image', ref: 'ref-a' }),
      leaf('3:5', { kind: 'image', ref: 'ref-a' }),
    ])
    const result = await resolveAssets(
      doc,
      new FigmaClient({ token: 't', fetch: fetchImpl as never }),
    )

    expect([...result.files.keys()]).toEqual(['ref-a.jpg'])
    expect(doc.root.children[0]!.asset!.fileName).toBe('ref-a.jpg')
    expect(doc.root.children[1]!.asset!.fileName).toBe('ref-a.jpg')
  })

  it('makes no network calls when skipped', async () => {
    const fetchImpl = vi.fn()
    const doc = docWith([leaf('1:5', { kind: 'svg', ref: '1:5' })])
    await resolveAssets(doc, new FigmaClient({ token: 't', fetch: fetchImpl as never }), {
      skip: true,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
