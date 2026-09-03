import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { auditDesign } from '../src/audit.js'
import type { FigmaNode, FileNodesResponse } from '../src/figma/types.js'

const entry = (file: string, nodeId: string) => {
  const r: FileNodesResponse = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${file}.json`, import.meta.url)), 'utf8'),
  )
  return r.nodes[nodeId]!
}

const codes = (document: FigmaNode, styles = {}) =>
  auditDesign({ document, styles }).map((f) => f.code)

describe('auditDesign', () => {
  it('says nothing about a colour that already has a Style bound', () => {
    const e = entry('card', '1:2')
    // The card's root fill carries `styles.fill`, so it is not an offender —
    // but its children do not, so the finding still fires overall.
    const finding = auditDesign({ document: e.document, styles: e.styles }).find(
      (f) => f.code === 'unbound-colours',
    )!
    expect(finding.examples).not.toContain('Card')
  })

  it('flags a container with no Auto Layout, which forces absolute positioning', () => {
    expect(codes(entry('legacy', '3:1').document)).toContain('no-auto-layout')
  })

  it('does not flag a frame that has Auto Layout', () => {
    expect(codes(entry('legacy', '2:1').document)).not.toContain('no-auto-layout')
  })

  it('names the Figma action for every finding, never a code change', () => {
    const findings = auditDesign({ document: entry('card', '1:2').document })
    expect(findings.length).toBeGreaterThan(0)
    for (const f of findings) {
      expect(f.fix).toBeTruthy()
      expect(f.title).toBeTruthy()
      expect(f.count).toBeGreaterThan(0)
    }
  })

  it('orders findings by severity', () => {
    const findings = auditDesign({ document: entry('card', '1:2').document })
    const rank = { high: 0, medium: 1, low: 2 }
    const seen = findings.map((f) => rank[f.severity])
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('ignores invisible layers, which produce no output to be wrong about', () => {
    const doc = entry('card', '1:2').document
    const hidden = doc.children!.find((c) => c.visible === false)!
    expect(auditDesign({ document: doc }).flatMap((f) => f.examples)).not.toContain(hidden.name)
  })

  it('tolerates a leaf node with no children', () => {
    expect(() => auditDesign({ document: { id: '1', name: 'x', type: 'TEXT' } })).not.toThrow()
  })
})
