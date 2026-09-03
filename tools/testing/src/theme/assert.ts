/**
 * Checks that every token in the theme actually paints what it declares.
 *
 * This is the value-level companion to `scripts/verify-styles.mjs`, which only
 * proves a class name produced *some* rule. Here the question is narrower and
 * more useful: does `--color-blue-600` resolve to `#2563eb` in a real browser,
 * or has the declaration been overridden, dropped by the bundler, or never
 * imported at all? Every one of those failures leaves a page that renders
 * cleanly and looks plausible.
 *
 * Plain `throw` rather than `expect`, matching `../fidelity/assert.ts`: the same
 * helper then runs inside the Storybook UI, where no assertion library exists.
 */

export interface ExpectedToken {
  cssVar: string
  name: string
  value: string
  named: boolean
  kind: string
}

/** `rgb(37, 99, 235)` and `#2563eb` are the same colour spelled two ways. */
function normaliseColor(input: string): string | undefined {
  const text = input.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)
  if (hex) {
    const h = hex[1]!
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
    return `#${full}`
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(text)
  if (rgb) {
    const parts = rgb[1]!
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number)
    const [r, g, b] = parts
    if (r === undefined || g === undefined || b === undefined) return undefined
    return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
  }

  return undefined
}

/**
 * A font stack survives the round trip, but the browser re-serialises it with
 * its own quoting and spacing, so both sides are flattened before comparing.
 */
function normaliseFont(input: string): string {
  return input
    .split(',')
    .map((f) =>
      f
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean)
    .join(',')
}

/**
 * Lengths are the one kind still skipped: `emitThemeCss` converts px → rem on
 * the way out, so `--spacing-4` is declared `1rem` and computed `16px`, and
 * comparing them means knowing the root font size at measure time. Skipped
 * kinds are reported rather than passed over.
 */
const COMPARABLE = new Set(['color', 'fontFamily'])

export async function expectTokensRendered(
  container: HTMLElement,
  expected: readonly ExpectedToken[],
): Promise<void> {
  if (expected.length === 0) {
    throw new Error(
      'expectTokensRendered was given no tokens. Regenerate the theme story — an empty ' +
        'expectation passes for free and checks nothing.',
    )
  }

  await document.fonts.ready

  // The count is checked before any value. A swatch that never rendered is the
  // failure a per-swatch loop skips over silently, and it is also the likeliest
  // one: it means the design gained a token the page does not know about.
  const rendered = new Map<string, HTMLElement>()
  for (const el of container.querySelectorAll<HTMLElement>('[data-token]')) {
    rendered.set(el.dataset['token']!, el)
  }

  const absent = expected.filter((t) => !rendered.has(t.cssVar))
  if (absent.length > 0) {
    throw new Error(
      `${absent.length} of ${expected.length} token(s) have no swatch in the DOM:\n` +
        absent.map((t) => `  ${t.cssVar} (${t.value})`).join('\n'),
    )
  }

  const failures: string[] = []
  const skipped: string[] = []

  for (const token of expected) {
    if (!COMPARABLE.has(token.kind)) {
      skipped.push(token.cssVar)
      continue
    }
    const el = rendered.get(token.cssVar)!
    const computed = getComputedStyle(el)

    if (token.kind === 'fontFamily') {
      const painted = normaliseFont(computed.fontFamily)
      const declared = normaliseFont(token.value)
      // The browser drops families it cannot resolve, so compare on the head of
      // the stack: that is the face the design actually asked for.
      if (!painted.startsWith(declared.split(',')[0]!)) {
        failures.push(`  ${token.cssVar}  declared ${declared}  painted ${painted || 'nothing'}`)
      }
      continue
    }

    const painted = normaliseColor(computed.backgroundColor)
    const declared = normaliseColor(token.value)

    if (declared === undefined) {
      skipped.push(`${token.cssVar} (unparseable value ${token.value})`)
      continue
    }
    if (painted !== declared) {
      failures.push(`  ${token.cssVar}  declared ${declared}  painted ${painted ?? 'nothing'}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} token(s) do not paint their declared value:\n${failures.join('\n')}\n` +
        'Usually the theme was not imported, or a later @theme block redeclared the same property.',
    )
  }

  // Reported, not swallowed: a check that quietly compares nothing is the thing
  // this file exists to prevent.
  if (skipped.length === expected.length) {
    throw new Error(
      `All ${expected.length} token(s) were skipped as incomparable, so nothing was checked: ` +
        skipped.join(', '),
    )
  }
}
