import { describe, expect, it } from 'vitest'
import type { ComponentEntry } from '@figma-to-react/emit-react'
import { emitStories, figmaUrl } from '../src/stories.js'
import { exportGeometry } from '../src/geometry.js'
import type { FigmaNode } from '@figma-to-react/core'

const entry = (over: Partial<ComponentEntry> = {}): ComponentEntry => ({
  figmaId: '2:66',
  exportName: 'ButtonPrimary',
  file: 'button-primary.tsx',
  set: 'Button',
  variant: 'Primary',
  props: [{ name: 'buttonLabel', defaultValue: 'Button Label' }],
  ...over,
})

const BUTTON_SET: ComponentEntry[] = [
  entry(),
  entry({
    figmaId: '2:68',
    exportName: 'ButtonSecondary',
    file: 'button-secondary.tsx',
    variant: 'Secondary',
  }),
]

const opts = { fileKey: 'ABC123' }

describe('figmaUrl', () => {
  it('uses the URL form of the node id, not the API form', () => {
    expect(figmaUrl('ABC123', '2:66')).toContain('node-id=2-66')
    expect(figmaUrl('ABC123', '2:66')).not.toContain('2:66')
  })
})

describe('emitStories', () => {
  it('groups a variant set into one file, one story per variant', () => {
    const [file] = emitStories(BUTTON_SET, opts)
    expect(file!.file).toBe('button.stories.tsx')
    expect(file!.source).toContain("title: 'Design System/Button'")
    expect(file!.source).toContain('export const Primary: Story')
    expect(file!.source).toContain('export const Secondary: Story')
  })

  it('points the design panel at the component node', () => {
    const [file] = emitStories(BUTTON_SET, opts)
    expect(file!.source).toContain("design: { type: 'figma'")
    expect(file!.source).toContain('node-id=2-66')
  })

  it('gives each standalone component its own file', () => {
    const files = emitStories(
      [
        entry({
          figmaId: '2:73',
          exportName: 'FormField',
          file: 'form-field.tsx',
          set: undefined,
          variant: undefined,
        }),
      ],
      opts,
    )
    expect(files.map((f) => f.file)).toEqual(['form-field.stories.tsx'])
    expect(files[0]!.source).toContain("title: 'Design System/FormField'")
    expect(files[0]!.source).toContain('export const Default: Story')
  })

  it('passes args only when the variant shares the meta component’s props', () => {
    // `Story` is typed from `meta.component`, so args carrying a prop that
    // component lacks does not compile. Three input states whose text layers
    // are named differently produce exactly that.
    const [file] = emitStories(
      [
        entry({
          exportName: 'InputDefault',
          set: 'Input',
          variant: 'Default',
          props: [{ name: 'placeholderText', defaultValue: 'Placeholder' }],
        }),
        entry({
          exportName: 'InputFocused',
          set: 'Input',
          variant: 'Focused',
          props: [{ name: 'inputValue', defaultValue: 'Value' }],
        }),
      ],
      opts,
    )
    expect(file!.source).toContain("placeholderText: 'Placeholder'")
    // The diverging variant passes its value literally instead.
    expect(file!.source).toContain('<InputFocused inputValue="Value" />')
    expect(file!.source).not.toContain("inputValue: 'Value'")
  })

  it('never emits `render: (())`, which is not valid syntax', () => {
    const [file] = emitStories(
      [entry(), entry({ exportName: 'ButtonGhost', variant: 'Ghost', props: [] })],
      opts,
    )
    expect(file!.source).not.toContain('(())')
    expect(file!.source).toContain('render: () => <ButtonGhost />')
  })

  it('adds a fidelity play function only when asked', () => {
    const plain = emitStories(BUTTON_SET, opts)[0]!.source
    expect(plain).not.toContain('expectLayoutWithin')

    const checked = emitStories(BUTTON_SET, {
      ...opts,
      fidelity: { threshold: 4, helperPath: '../fidelity/assert.js' },
    })[0]!.source
    expect(checked).toContain('await expectLayoutWithin(canvasElement, 4)')
  })

  it('names the file that hand-written stories belong in', () => {
    expect(emitStories(BUTTON_SET, opts)[0]!.source).toContain('button.custom.stories.tsx')
  })

  it('matches the button snapshot', () => {
    expect(emitStories(BUTTON_SET, opts)[0]!.source).toMatchSnapshot()
  })
})

describe('exportGeometry', () => {
  const tree: FigmaNode = {
    id: '1:1',
    name: 'Root',
    type: 'FRAME',
    absoluteBoundingBox: { x: 100, y: 50, width: 400, height: 200 },
    children: [
      {
        id: '1:2',
        name: 'Child',
        type: 'FRAME',
        absoluteBoundingBox: { x: 140, y: 90, width: 100, height: 40 },
      },
      {
        id: '1:3',
        name: 'Hidden',
        type: 'FRAME',
        visible: false,
        absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
      },
      {
        id: '1:4',
        name: 'Mask',
        type: 'RECTANGLE',
        isMask: true,
        absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  }

  it('reports positions relative to the root, so both frames of reference line up', () => {
    const g = exportGeometry(tree)
    expect(g['1:1']).toMatchObject({ x: 0, y: 0, w: 400, h: 200 })
    expect(g['1:2']).toMatchObject({ x: 40, y: 40, w: 100, h: 40 })
  })

  it('omits nodes that render nothing, which would look like the renderer lost them', () => {
    const g = exportGeometry(tree)
    expect(g['1:3']).toBeUndefined()
    expect(g['1:4']).toBeUndefined()
  })

  it('returns nothing for a root with no box to anchor on', () => {
    expect(exportGeometry({ id: 'x', name: 'x', type: 'FRAME' })).toEqual({})
  })
})
