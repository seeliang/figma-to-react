/**
 * Measures rendered markup against the geometry Figma reported for the same
 * nodes, and throws when anything drifts past `thresholdPx`.
 *
 * Shared by the whole-frame fidelity page and by each story's play function,
 * which is what turns drift into a failing build.
 *
 * The geometry is **passed in** rather than imported. It used to be a static
 * import of `../design-system/figma-geometry.json`, which pinned this helper to
 * one generated directory — fine when there was one, wrong once each layer
 * package ships its own. The caller owns the file; this owns the arithmetic.
 */

export interface NodeBox {
  name: string
  type: string
  x: number
  y: number
  w: number
  h: number
}

export type Geometry = Record<string, NodeBox>

export interface Delta {
  id: string
  name: string
  type: string
  dx: number
  dy: number
  dw: number
  dh: number
}

export const worstDelta = (d: Delta) =>
  Math.max(Math.abs(d.dx), Math.abs(d.dy), Math.abs(d.dw), Math.abs(d.dh))

/**
 * Both coordinate systems are anchored on the first traced element inside
 * `container`, so a story rendering one component in isolation compares on the
 * same footing as the whole frame.
 */
export function measure(geometry: Geometry, container: HTMLElement | Document = document): Delta[] {
  const scope = container instanceof Document ? container.body : container
  const root = scope.querySelector<HTMLElement>('[data-figma-id]')
  if (!root) return []

  const anchor = geometry[root.dataset['figmaId']!]
  if (!anchor) return []
  const origin = root.getBoundingClientRect()

  const deltas: Delta[] = []
  const seen = new Set<string>()

  for (const el of scope.querySelectorAll<HTMLElement>('[data-figma-id]')) {
    const id = el.dataset['figmaId']!
    const box = geometry[id]
    // A component renders at every use site; the first is representative and
    // the rest would only report their different positions.
    if (!box || seen.has(id)) continue

    // A COMPONENT's box is where its definition sits on the Figma canvas, which
    // says nothing about where an instance of it renders inside another
    // component. Its position is only meaningful when it is the anchor — the
    // subject of the story. Its *size* is still checked, there, and the call
    // site's own INSTANCE node carries the position that does mean something.
    if (box.type === 'COMPONENT' && el !== root) continue

    seen.add(id)

    const r = el.getBoundingClientRect()
    deltas.push({
      id,
      name: box.name,
      type: box.type,
      dx: round(r.left - origin.left + anchor.x - box.x),
      dy: round(r.top - origin.top + anchor.y - box.y),
      dw: round(r.width - box.w),
      dh: round(r.height - box.h),
    })
  }

  return deltas.sort((a, b) => worstDelta(b) - worstDelta(a))
}

/**
 * Waits for the real typeface before measuring. Measuring against a fallback
 * reports that font's metrics, which is how a passing check can still be
 * measuring the wrong thing.
 */
export async function expectLayoutWithin(
  container: HTMLElement,
  thresholdPx: number,
  geometry: Geometry,
): Promise<void> {
  await document.fonts.ready

  if (!container.querySelector('[data-figma-id]')) {
    throw new Error(
      'No [data-figma-id] found. Regenerate with --trace-ids, or this assertion measures nothing.',
    )
  }

  const failures = measure(geometry, container).filter((d) => worstDelta(d) > thresholdPx)
  if (failures.length === 0) return

  const detail = failures
    .map((d) => `  ${d.name} (${d.type})  dx ${d.dx}  dy ${d.dy}  dw ${d.dw}  dh ${d.dh}`)
    .join('\n')
  throw new Error(
    `${failures.length} node(s) differ from Figma by more than ${thresholdPx}px:\n${detail}`,
  )
}

const round = (n: number) => Math.round(n * 10) / 10
