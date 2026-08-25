#!/usr/bin/env node
/**
 * Guards the failure mode that a passing build does not catch: Tailwind emits
 * no rule for a generated class, so the page renders unstyled while `vite build`
 * and `tsc --noEmit` both report success.
 *
 * Reads the classes the generated components actually use, then checks each one
 * appears in the built stylesheet.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Every directory figma2react writes into. A missing one is skipped, not fatal:
// the design-system output needs a Figma token that CI may not have.
const GENERATED = ['examples/src/generated', 'examples/src/design-system']
// Storybook produces its own bundle from the same sources, and a Tailwind
// plugin missing from *its* config fails exactly as silently.
const distFlag = process.argv.indexOf('--dist')
const DIST = distFlag === -1 ? 'examples/dist/assets' : process.argv[distFlag + 1]

const used = new Set()
let scanned = 0

for (const dir of GENERATED) {
  let files
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.tsx'))
  } catch {
    console.log(`  skipping ${dir} (not generated)`)
    continue
  }
  for (const file of files) {
    const source = await readFile(join(dir, file), 'utf8')
    for (const [, value] of source.matchAll(/className="([^"]+)"/g)) {
      for (const cls of value.split(/\s+/)) if (cls) used.add(cls)
    }
    scanned++
  }
}

if (scanned === 0) {
  console.error('No generated components found — run figma2react gen first.')
  process.exit(1)
}

const stylesheets = (await readdir(DIST)).filter((f) => f.endsWith('.css'))
// Storybook splits its bundle; a class may land in any of the sheets.
const cssFile = stylesheets[0]
if (!cssFile) {
  console.error(`No stylesheet in ${DIST} — run the example build first.`)
  process.exit(1)
}
const css = (await Promise.all(stylesheets.map((f) => readFile(join(DIST, f), 'utf8')))).join('\n')

// Tailwind escapes the punctuation in arbitrary values, so compare on the part
// before the first bracket — enough to prove a rule was generated at all.
const missing = [...used].filter((cls) => !css.includes(cls.split('[')[0]))

if (missing.length > 0) {
  console.error(`\n${missing.length} generated class(es) produced no CSS rule:`)
  for (const cls of missing) console.error(`  ${cls}`)
  console.error('\nUsually means Tailwind is not scanning the generated directory.')
  process.exit(1)
}

console.log(
  `All ${used.size} generated classes from ${scanned} component(s) resolve to CSS rules in ${DIST}.`,
)
