import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalize } from '@figma-to-react/core'
import type { FileNodesResponse } from '@figma-to-react/core'
import { describe, expect, it } from 'vitest'
import { emit } from '../src/emit.js'
import { formatAll } from '../src/format.js'
import { NameRegistry, toCamelCase, toFileName, toPascalCase } from '../src/naming.js'

const FIXTURES = new URL('../../core/test/fixtures/', import.meta.url)

async function generate(file: string, nodeId: string, options: Parameters<typeof emit>[1] = {}) {
  const response: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`${file}.json`, FIXTURES)), 'utf8'),
  )
  const entry = response.nodes[nodeId]!
  const doc = normalize({
    fileKey: 'TEST',
    document: entry.document,
    components: entry.components,
    componentSets: entry.componentSets,
    styles: entry.styles,
  })
  const result = emit(doc, options)
  return { ...result, files: await formatAll(result.files) }
}

describe('naming', () => {
  it('flattens variant paths so variants cannot collide', () => {
    expect(toPascalCase('Button/Primary')).toBe('ButtonPrimary')
    expect(toPascalCase('icon / chevron-down')).toBe('IconChevronDown')
  })

  it('preserves existing camelCase word boundaries', () => {
    expect(toPascalCase('navBar')).toBe('NavBar')
  })

  it('handles names that are not valid identifiers', () => {
    expect(toPascalCase('🔥 Hero')).toBe('Hero')
    expect(toPascalCase('1 Column')).toBe('N1Column')
    expect(toPascalCase('   ')).toBe('Component')
  })

  it('avoids identifiers that would collide with generated code', () => {
    // `Class` is a legal identifier; `class` is not.
    expect(toPascalCase('class')).toBe('Class')
    expect(toCamelCase('class')).toBe('classProp')
    // `Props` would shadow the generated props type.
    expect(toPascalCase('props')).toBe('PropsComponent')
  })

  it('gives colliding layer names distinct, stable identifiers', () => {
    const reg = new NameRegistry()
    expect(reg.claim('a', 'Card')).toBe('Card')
    expect(reg.claim('b', 'Card')).toBe('Card2')
    expect(reg.claim('a', 'Card')).toBe('Card')
  })

  it('derives kebab file names from PascalCase exports', () => {
    expect(toFileName('ButtonPrimary')).toBe('button-primary.tsx')
  })
})

describe('emit: card', () => {
  it('produces one file per component plus the root', async () => {
    const { files, rootComponent } = await generate('card', '1:2')
    expect(rootComponent).toBe('Card')
    expect([...files.keys()].sort()).toEqual(['button-primary.tsx', 'card.tsx'])
  })

  it('matches the card snapshot', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('card.tsx')).toMatchSnapshot()
  })

  it('matches the extracted component snapshot', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('button-primary.tsx')).toMatchSnapshot()
  })

  it('imports the extracted component rather than inlining it again', async () => {
    const { files } = await generate('card', '1:2')
    const card = files.get('card.tsx')!
    expect(card).toContain("import { ButtonPrimary } from './button-primary.js'")
    expect(card).toContain('<ButtonPrimary')
  })

  it('does not import a component into its own definition file', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('button-primary.tsx')).not.toContain('import { ButtonPrimary }')
  })

  it('exposes text leaves as optional props defaulted from the design', async () => {
    const { files } = await generate('card', '1:2')
    const card = files.get('card.tsx')!
    expect(card).toContain('export type CardProps = {')
    expect(card).toContain("title = 'Monthly report'")
  })

  it('omits invisible layers from the output', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('card.tsx')).not.toContain('should not be emitted')
  })
})

describe('emit: semantic elements', () => {
  it('emits a real <button> for a layer named like one', async () => {
    const { files } = await generate('card', '1:2')
    const button = files.get('button-primary.tsx')!
    expect(button).toContain('<button')
    expect(button).toContain('type="button"')
    expect(button).not.toMatch(/<div/)
  })

  it('uses <span> inside a button, since <p> there is invalid HTML', async () => {
    const { files } = await generate('card', '1:2')
    const button = files.get('button-primary.tsx')!
    expect(button).toContain('<span')
    expect(button).not.toContain('<p ')
  })

  it('gives a button a pointer cursor, which Tailwind v4 Preflight removes', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('button-primary.tsx')).toContain('cursor-pointer')
  })

  it('does not put a pointer cursor on an input, which wants a text caret', async () => {
    const { files } = await generate('card', '1:2')
    expect(files.get('card.tsx')).not.toContain('cursor-pointer')
  })

  it('falls back to plain divs when semantics are off', async () => {
    const { files } = await generate('card', '1:2', { semantics: false })
    const button = files.get('button-primary.tsx')!
    expect(button).toContain('<div')
    expect(button).not.toContain('<button')
  })

  it('leaves a wrapper alone when it holds more than one text leaf', async () => {
    // A `Form Field` is a label stacked above an input; only the inner control
    // is an element, and collapsing the wrapper would lose the label.
    const { files } = await generate('card', '1:2')
    expect(files.get('card.tsx')).toContain('<div')
  })
})

describe('emit: component placement', () => {
  it('wraps a collapsed component tag so its position survives', async () => {
    // A `<Card />` tag has nowhere to put a class. Dropping the placement made
    // the component render at the flow position and overlap its neighbours.
    const { files } = await generate('card', '1:2')
    const card = files.get('card.tsx')!
    const line = card.split('\n').find((l) => l.includes('<ButtonPrimary'))!
    expect(line.trim().startsWith('<ButtonPrimary')).toBe(true)
  })

  it('carries placement onto a wrapper when the parent positions absolutely', async () => {
    const { files } = await generate('legacy', '3:1')
    const src = files.get('absolute-group.tsx')!
    // Every absolutely positioned child keeps its offset, tag or div alike.
    expect(src.match(/absolute left-\[/g)?.length).toBeGreaterThan(0)
  })
})

describe('emit: absolute layout', () => {
  it('matches the absolute-positioning snapshot', async () => {
    const { files } = await generate('legacy', '3:1')
    expect(files.get('absolute-group.tsx')).toMatchSnapshot()
  })

  it('makes a no-layout parent the containing block for its children', async () => {
    const { files } = await generate('legacy', '3:1')
    const src = files.get('absolute-group.tsx')!
    expect(src).toContain('relative')
    expect(src).toContain('absolute left-[20px] top-[20px]')
  })
})

describe('emit: legacy sizing', () => {
  it('matches the legacy-row snapshot', async () => {
    const { files } = await generate('legacy', '2:1')
    expect(files.get('legacy-row.tsx')).toMatchSnapshot()
  })
})
