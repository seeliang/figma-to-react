import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DesignSystem } from './design-system/design-system.js'
import './styles.css'

/**
 * Measures the generated markup against the geometry Figma reported for the
 * same nodes, and reports the deltas.
 *
 * Comparing by eye caught real bugs, but only the ones large enough to notice.
 * This catches the rest: it found hugging text rendering 332px too wide, a
 * stale `layoutAlign` stretching an input to its container, and Figma's "Auto"
 * line height resolving ~3px per line differently in the browser — which is
 * invisible per node and compounds into tens of pixels down a column.
 *
 * Requires `gen --trace-ids`, and `public/figma-geometry.json` exported from
 * the same file.
 */

interface Box {
  name: string
  type: string
  x: number
  y: number
  w: number
  h: number
}

interface Row {
  id: string
  name: string
  type: string
  dx: number
  dy: number
  dw: number
  dh: number
}

const worst = (r: Row) => Math.max(Math.abs(r.dx), Math.abs(r.dy), Math.abs(r.dw), Math.abs(r.dh))

function measure(figma: Record<string, Box>): Row[] {
  const root = document.querySelector<HTMLElement>('[data-figma-id]')
  if (!root) return []
  const anchor = figma[root.dataset.figmaId!]
  if (!anchor) return []
  const origin = root.getBoundingClientRect()

  const rows: Row[] = []
  const seen = new Set<string>()
  for (const el of document.querySelectorAll<HTMLElement>('[data-figma-id]')) {
    const id = el.dataset.figmaId!
    const f = figma[id]
    // A component renders at every use site; compare the first, since the rest
    // are the same markup in a different place.
    if (!f || seen.has(id)) continue
    seen.add(id)
    const r = el.getBoundingClientRect()
    rows.push({
      id,
      name: f.name,
      type: f.type,
      dx: +(r.left - origin.left + anchor.x - f.x).toFixed(1),
      dy: +(r.top - origin.top + anchor.y - f.y).toFixed(1),
      dw: +(r.width - f.w).toFixed(1),
      dh: +(r.height - f.h).toFixed(1),
    })
  }
  return rows.sort((a, b) => worst(b) - worst(a))
}

function Report({ rows }: { rows: Row[] }) {
  const within = (t: number) => rows.filter((r) => worst(r) <= t).length
  const pct = (n: number) => Math.round((n / rows.length) * 100)

  return (
    <aside className="fixed top-0 right-0 h-screen w-[420px] overflow-y-auto border-l border-neutral-300 bg-white p-4 text-xs">
      <h1 className="mb-2 text-sm font-semibold">Layout fidelity vs Figma</h1>
      <p className="mb-3 text-neutral-600">
        {rows.length} nodes compared. Text width deltas of a few px are font rendering, not codegen.
      </p>
      <table className="mb-4 w-full tabular-nums">
        <tbody>
          {[1, 2, 4, 8].map((t) => (
            <tr key={t}>
              <td className="py-0.5">within {t}px</td>
              <td className="text-right font-medium">
                {within(t)} ({pct(within(t))}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full tabular-nums">
        <thead className="text-neutral-500">
          <tr>
            <th className="text-left font-medium">node</th>
            <th className="text-right font-medium">dx</th>
            <th className="text-right font-medium">dy</th>
            <th className="text-right font-medium">dw</th>
            <th className="text-right font-medium">dh</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((r) => (
            <tr key={r.id} className={worst(r) > 4 ? 'text-red-700' : 'text-neutral-700'}>
              <td className="max-w-[180px] truncate pr-2" title={`${r.name} (${r.type})`}>
                {r.name}
              </td>
              <td className="text-right">{r.dx}</td>
              <td className="text-right">{r.dy}</td>
              <td className="text-right">{r.dw}</td>
              <td className="text-right">{r.dh}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  )
}

function Fidelity() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // Wait for webfonts: measuring before they land reports the fallback's
    // metrics, not the design's.
    void document.fonts.ready.then(async () => {
      const figma: Record<string, Box> = await fetch('/figma-geometry.json').then((r) => r.json())
      if (!cancelled) setRows(measure(figma))
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="w-max">
        <DesignSystem />
      </div>
      {rows && <Report rows={rows} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Fidelity />)
