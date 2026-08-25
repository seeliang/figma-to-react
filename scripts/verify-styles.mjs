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

const GENERATED = 'examples/src/generated'
const DIST = 'examples/dist/assets'

const componentFiles = (await readdir(GENERATED)).filter((f) => f.endsWith('.tsx'))
if (componentFiles.length === 0) {
  console.error(`No generated components in ${GENERATED} — run figma2react gen first.`)
  process.exit(1)
}

const used = new Set()
for (const file of componentFiles) {
  const source = await readFile(join(GENERATED, file), 'utf8')
  for (const [, value] of source.matchAll(/className="([^"]+)"/g)) {
    for (const cls of value.split(/\s+/)) if (cls) used.add(cls)
  }
}

const cssFile = (await readdir(DIST)).find((f) => f.endsWith('.css'))
if (!cssFile) {
  console.error(`No stylesheet in ${DIST} — run the example build first.`)
  process.exit(1)
}
const css = await readFile(join(DIST, cssFile), 'utf8')

// Tailwind escapes the punctuation in arbitrary values, so compare on the part
// before the first bracket — enough to prove a rule was generated at all.
const missing = [...used].filter((cls) => !css.includes(cls.split('[')[0]))

if (missing.length > 0) {
  console.error(`\n${missing.length} generated class(es) produced no CSS rule:`)
  for (const cls of missing) console.error(`  ${cls}`)
  console.error('\nUsually means Tailwind is not scanning the generated directory.')
  process.exit(1)
}

console.log(`All ${used.size} generated classes resolve to CSS rules in ${cssFile}.`)
