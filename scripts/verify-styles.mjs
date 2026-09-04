#!/usr/bin/env node
/**
 * Guards the failure mode that a passing build does not catch: a generated class
 * reaches the markup but its rule never reaches the bundle, so the page renders
 * unstyled while `vite build` and `tsc --noEmit` both report success.
 *
 * Reads the classes the generated components actually use, then checks each one
 * appears in the built stylesheet.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

// Component packages are the only generated UI source. Their paths come from
// the repository layout rather than a demo app, so deleting a demo cannot
// silently stop this check from scanning components.
const GENERATED = ['packages/atoms/src', 'packages/molecules/src', 'packages/organisms/src']
// Storybook produces its own bundle from the same sources, and a stylesheet
// missing from *its* config fails exactly as silently.
const distFlag = process.argv.indexOf('--dist')
const DIST = distFlag === -1 ? 'storybook-static/assets' : process.argv[distFlag + 1]

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
  console.error(`No stylesheet in ${DIST} — run the Storybook build first.`)
  process.exit(1)
}
const raw = (await Promise.all(stylesheets.map((f) => readFile(join(DIST, f), 'utf8')))).join('\n')

// Generated class names are `f2r-<fileKey>-<nodeId>` — no punctuation a CSS
// selector would escape — so the whole class is compared, not a prefix of it.
// An earlier prefix comparison existed to tolerate escaped utility syntax; it
// silently weakened the check once that syntax stopped being emitted.
const missing = [...used].filter((cls) => !raw.includes(cls))

if (missing.length > 0) {
  console.error(`\n${missing.length} generated class(es) produced no CSS rule:`)
  for (const cls of missing) console.error(`  ${cls}`)
  console.error('\nUsually means the package stylesheet never reached the bundle.')
  process.exit(1)
}

console.log(
  `All ${used.size} generated classes from ${scanned} component(s) resolve to CSS rules in ${DIST}.`,
)
