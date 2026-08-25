import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DesignSystem } from './design-system/design-system.js'
import { measure, worstDelta } from './fidelity/assert.js'
import type { Delta } from './fidelity/assert.js'
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

function Report({ rows }: { rows: Delta[] }) {
  const within = (t: number) => rows.filter((r) => worstDelta(r) <= t).length
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
            <tr key={r.id} className={worstDelta(r) > 4 ? 'text-red-700' : 'text-neutral-700'}>
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
  const [rows, setRows] = useState<Delta[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // Wait for webfonts: measuring before they land reports the fallback's
    // metrics, not the design's.
    void document.fonts.ready.then(() => {
      if (!cancelled) setRows(measure())
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
