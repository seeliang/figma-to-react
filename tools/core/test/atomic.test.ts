import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type Layer, assignLayers, countElements } from '../src/atomic.js'
import { auditDesign } from '../src/audit.js'
import type { FigmaNode, FileNodesResponse } from '../src/figma/types.js'

const entry = (file: string, nodeId: string) => {
  const r: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${file}.json`, import.meta.url)), 'utf8'),
  )
  return r.nodes[nodeId]!
}

const ds = () => entry('design-system', '2:77').document
const byName = (document: FigmaNode, overrides?: Record<string, Layer>) =>
  new Map(assignLayers({ document, overrides }).map((a) => [a.name, a]))

/** A frame with `children`, enough for the structure rules. */
const node = (n: Partial<FigmaNode> & Pick<FigmaNode, 'id' | 'name' | 'type'>): FigmaNode =>
  ({ children: [], ...n }) as FigmaNode

describe('assignLayers: suggestions', () => {
  it('reads a variant set as one component, not one per variant', () => {
    const all = assignLayers({ document: ds() })
    expect(all.map((a) => a.name)).toEqual(['Input Field', 'Button', 'Form Field'])
  })

  it('suggests atom for a component that renders a single element', () => {
    const button = byName(ds()).get('Button')!
    expect(button.suggested).toBe('atom')
    expect(button.evidence.elements).toBe(1)
    expect(button.reason).toContain('no nested components')
  })

  it('suggests molecule for a multi-element component that includes another', () => {
    const field = byName(ds()).get('Form Field')!
    expect(field.suggested).toBe('molecule')
    expect(field.evidence.includes).toEqual(['Input Field'])
  })

  it('suggests organism for something spanning the frame', () => {
    const document = node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      children: [
        node({
          id: '1',
          name: 'Site Header',
          type: 'COMPONENT',
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 64 },
          children: [
            node({ id: '2', name: 'Logo', type: 'FRAME' }),
            node({ id: '3', name: 'Nav', type: 'FRAME' }),
          ],
        }),
      ],
    })
    const header = byName(document).get('Site Header')!
    expect(header.suggested).toBe('organism')
    expect(header.evidence.rootLevel).toBe(true)
  })

  it('refuses to suggest when the signals disagree', () => {
    // One element says atom; spanning the frame says organism. Guessing here is
    // exactly the mis-sort the whole layering exercise is meant to prevent.
    const document = node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      children: [
        node({
          id: '1',
          name: 'Divider',
          type: 'COMPONENT',
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 1 },
        }),
      ],
    })
    const divider = byName(document).get('Divider')!
    expect(divider.suggested).toBeUndefined()
    expect(divider.reason).toContain('which is it?')
  })
})

describe('assignLayers: where the layer comes from', () => {
  const wrapped = (sectionName: string) =>
    node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 },
      children: [
        node({
          id: 's',
          name: sectionName,
          type: 'SECTION',
          children: [node({ id: '1', name: 'Button', type: 'COMPONENT' })],
        }),
      ],
    })

  it('reads the layer from an enclosing section', () => {
    const a = byName(wrapped('Atoms')).get('Button')!
    expect([a.layer, a.source]).toEqual(['atom', 'section'])
  })

  it('reads the layer from a name prefix', () => {
    const document = node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      children: [node({ id: '1', name: 'molecule/Search Bar', type: 'COMPONENT' })],
    })
    const a = byName(document).get('molecule/Search Bar')!
    expect([a.layer, a.source]).toEqual(['molecule', 'prefix'])
  })

  it('falls back to the config override', () => {
    const a = byName(ds(), { Button: 'atom' }).get('Button')!
    expect([a.layer, a.source]).toEqual(['atom', 'override'])
  })

  it('prefers the section over the override, because the file is the decision', () => {
    const a = byName(wrapped('Organisms'), { Button: 'atom' }).get('Button')!
    expect([a.layer, a.source]).toEqual(['organism', 'section'])
  })

  it('leaves the layer unset rather than adopting its own suggestion', () => {
    const a = byName(ds()).get('Button')!
    expect(a.layer).toBeUndefined()
    expect(a.suggested).toBe('atom')
  })
})

describe('countElements', () => {
  it('counts a container whose only child is text as one element', () => {
    // This is what makes an Input Field an atom: the emitter collapses it into
    // a single <input>, so counting Figma layers would over-count it.
    const n = node({
      id: '1',
      name: 'Button',
      type: 'COMPONENT',
      children: [node({ id: '2', name: 'Label', type: 'TEXT' })],
    })
    expect(countElements(n)).toBe(1)
  })

  it('counts every element once past that', () => {
    const n = node({
      id: '1',
      name: 'Field',
      type: 'COMPONENT',
      children: [
        node({ id: '2', name: 'Label', type: 'TEXT' }),
        node({ id: '3', name: 'Input', type: 'FRAME' }),
      ],
    })
    expect(countElements(n)).toBe(3)
  })

  it('ignores hidden layers', () => {
    const n = node({
      id: '1',
      name: 'Field',
      type: 'COMPONENT',
      children: [
        node({ id: '2', name: 'Label', type: 'TEXT' }),
        node({ id: '3', name: 'Ghost', type: 'FRAME', visible: false }),
      ],
    })
    expect(countElements(n)).toBe(1)
  })
})

describe('layering findings', () => {
  const codes = (document: FigmaNode, extra = {}) =>
    auditDesign({ document, ...extra }).map((f) => f.code)

  it('flags every unsorted component, and puts the suggestion in the fix', () => {
    const finding = auditDesign({ document: ds() }).find((f) => f.code === 'layer-unclassified')!
    expect(finding.count).toBe(3)
    expect(finding.fix).toContain('Button → atom')
    expect(finding.fix).toContain('Form Field → molecule')
  })

  it('stops flagging once the layers are declared', () => {
    const layers = { 'Input Field': 'atom', Button: 'atom', 'Form Field': 'molecule' } as const
    expect(codes(ds(), { layers })).not.toContain('layer-unclassified')
  })

  it('flags a molecule that includes something at its own layer or above', () => {
    const layers = { 'Input Field': 'molecule', 'Form Field': 'molecule' } as const
    const finding = auditDesign({ document: ds(), layers }).find(
      (f) => f.code === 'layer-dependency-violation',
    )!
    expect(finding.examples[0]).toContain('Form Field (molecule) includes Input Field (molecule)')
  })

  it('flags an atom that includes anything at all', () => {
    const layers = { 'Input Field': 'atom', 'Form Field': 'atom' } as const
    expect(codes(ds(), { layers })).toContain('layer-dependency-violation')
  })

  it('allows a molecule to include an atom', () => {
    const layers = { 'Input Field': 'atom', 'Form Field': 'molecule' } as const
    expect(codes(ds(), { layers })).not.toContain('layer-dependency-violation')
  })

  it('flags an atom that renders more than one element', () => {
    expect(codes(ds(), { layers: { 'Form Field': 'atom' } })).toContain('atom-multi-element')
  })

  it('flags an organism that does not span the frame', () => {
    expect(codes(ds(), { layers: { Button: 'organism' } })).toContain('organism-not-full-width')
  })

  it("flags a layer wearing another component's namespace", () => {
    const document = node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      children: [
        node({ id: '1', name: 'Organism A', type: 'COMPONENT' }),
        node({
          id: '2',
          name: 'Molecule 0',
          type: 'COMPONENT',
          children: [node({ id: '3', name: 'Organism A__element', type: 'FRAME' })],
        }),
      ],
    })
    const finding = auditDesign({ document }).find((f) => f.code === 'mixed-scope')!
    expect(finding.examples[0]).toContain('sits inside Molecule 0')
  })

  it('flags an instance resized away from its master', () => {
    const document = node({
      id: '0',
      name: 'Page',
      type: 'FRAME',
      children: [
        node({
          id: 'm',
          name: 'Input',
          type: 'COMPONENT',
          absoluteBoundingBox: { x: 0, y: 0, width: 138, height: 44 },
        }),
        node({
          id: 'p',
          name: 'Wrapper',
          type: 'COMPONENT',
          children: [
            node({
              id: 'i',
              name: 'Input',
              type: 'INSTANCE',
              componentId: 'm',
              absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 44 },
            }),
          ],
        }),
      ],
    })
    const finding = auditDesign({ document }).find((f) => f.code === 'scope-size-override')!
    expect(finding.examples[0]).toContain('is 320×44, its master is 138×44')
  })

  it('says nothing about ownership once a default is declared', () => {
    expect(codes(ds(), { defaultOwnership: 'public' })).not.toContain('unowned-component')
  })

  it('flags a file with no breakpoints anywhere', () => {
    expect(codes(ds())).toContain('no-breakpoints')
  })
})
