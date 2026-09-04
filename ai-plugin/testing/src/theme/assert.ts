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
  /** What the design calls this. More than one entry means a silent merge. */
  design?: string[]
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
 * `emitThemeCss` converts px → rem on the way out, so `--radius-8` is declared
 * `8px` in the manifest and `0.5rem` in the stylesheet. That looked like a
 * reason to skip lengths, but it is not: the *computed* style is always px, so
 * comparing the manifest's px against the computed px checks the whole round
 * trip — including the rem conversion — without knowing the root font size.
 *
 * The swatch has to actually use the token for this to mean anything, which is
 * why the radius swatch sets `border-radius` and the spacing swatch sets a bar
 * width from it.
 */
const COMPARABLE = new Set(['color', 'fontFamily', 'radius', 'spacing'])

/** `8px`, `0.5rem` once computed, `8` — all the same length. */
function normaliseLength(input: string): number | undefined {
  const px = /^(-?[\d.]+)px$/.exec(input.trim())
  if (px) return Math.round(Number(px[1]) * 100) / 100
  const bare = /^(-?[\d.]+)$/.exec(input.trim())
  if (bare) return Math.round(Number(bare[1]) * 100) / 100
  return undefined
}

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

  // The design's own label for each token, checked for *faithfulness* only:
  // does the page still show what the manifest says the design called it?
  //
  // Deliberately not a judgement about merging. A token fed by two Figma
  // sources is a real problem, but the fix is in the design file, and a browser
  // test that goes red for something no code change can resolve is a test
  // nobody can act on. The audit and the naming gate own that verdict; this
  // owns whether the page tells the truth about it.
  const misdescribed: string[] = []
  for (const token of expected) {
    if (!token.design) continue
    const shown = rendered.get(token.cssVar)!.dataset['tokenDesign'] ?? ''
    if (shown !== token.design.join(',')) {
      misdescribed.push(`  ${token.cssVar}  manifest ${token.design.join(', ')}  page ${shown || 'nothing'}`)
    }
  }
  if (misdescribed.length > 0) {
    throw new Error(
      `${misdescribed.length} token(s) show a different design source than the manifest records:\n` +
        `${misdescribed.join('\n')}\n` +
        'The story is stale — regenerate it.',
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

    if (token.kind === 'radius' || token.kind === 'spacing') {
      // Computed border-radius reports all four corners once they differ; the
      // token sets one value, so the first is the whole answer.
      const raw =
        token.kind === 'radius'
          ? computed.borderTopLeftRadius
          : getComputedStyle(el.firstElementChild ?? el).width
      const paintedPx = normaliseLength(raw)
      const declaredPx = normaliseLength(token.value)
      if (declaredPx === undefined) {
        skipped.push(`${token.cssVar} (unparseable length ${token.value})`)
        continue
      }
      if (paintedPx !== declaredPx) {
        failures.push(
          `  ${token.cssVar}  declared ${declaredPx}px  painted ${paintedPx === undefined ? 'nothing' : `${paintedPx}px`}`,
        )
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
