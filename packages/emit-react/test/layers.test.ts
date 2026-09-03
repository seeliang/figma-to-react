import { normalize } from '@figma-to-react/core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emit } from '../src/emit.js'

const doc = () => {
  const r = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../core/test/fixtures/design-system.json', import.meta.url)),
      'utf8',
    ),
  )
  const e = r.nodes['2:77']
  return normalize({
    fileKey: 'K',
    document: e.document,
    components: e.components,
    componentSets: e.componentSets,
    styles: e.styles,
  })
}

const PACKAGES = { atom: '@ds/atoms', molecule: '@ds/molecules', organism: '@ds/organisms' }
const SORTED = { 'Input Field': 'atom', Button: 'atom', 'Form Field': 'molecule' } as const

/** Form Field is the only component here that imports another. */
const formField = (files: Map<string, string>) => files.get('form-field.tsx')!

describe('cross-layer imports', () => {
  it('writes a package specifier when the target sits in another layer', () => {
    const { files } = emit(doc(), { layers: SORTED, layerPackages: PACKAGES })
    // This is the whole point of the split: once it is a package import, an
    // atom importing a molecule fails to compile rather than merely failing an
    // audit nobody ran.
    expect(formField(files)).toContain("from '@ds/atoms'")
    expect(formField(files)).not.toContain("from './input-field-default.js'")
  })

  it('keeps a relative path within one layer', () => {
    const sameLayer = { ...SORTED, 'Form Field': 'atom' } as const
    const { files } = emit(doc(), { layers: sameLayer, layerPackages: PACKAGES })
    expect(formField(files)).toContain("from './input-field-default.js'")
  })

  it('falls back to relative paths when nothing has been sorted', () => {
    // Every design system looks like this before anyone does the sorting, and
    // the generator has to keep producing working code meanwhile.
    const { files } = emit(doc())
    expect(formField(files)).toContain("from './input-field-default.js'")
  })

  it('falls back when the layer is known but no package publishes it', () => {
    const { files } = emit(doc(), { layers: SORTED, layerPackages: {} })
    expect(formField(files)).toContain("from './input-field-default.js'")
  })

  it('records the layer on each manifest entry', () => {
    const { components } = emit(doc(), { layers: SORTED, layerPackages: PACKAGES })
    const byName = new Map(components.map((c) => [c.exportName, c.layer]))
    expect(byName.get('FormField')).toBe('molecule')
    expect(byName.get('InputFieldDefault')).toBe('atom')
  })
})
