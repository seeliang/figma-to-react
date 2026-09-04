#!/usr/bin/env node
/**
 * The skills in `ai-plugin/cli/skills/` document the CLI they ship beside. Prose
 * drift is unassertable, but a skill naming a command or a flag that does not
 * exist is not — and that is the drift that actually breaks a reader, because
 * they paste it and it fails.
 *
 * Also checks the two version fields agree. NX will bump `package.json`; there
 * is nothing to make it bump `plugin.json`, so the only thing standing between
 * them and silent disagreement is this.
 *
 *   node scripts/verify-skills.mjs
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = join(ROOT, 'ai-plugin/cli')
const CLI = join(PLUGIN, 'dist/index.js')
const SKILLS = join(PLUGIN, 'skills')

/** Facts about the repository that must never ship inside the plugin. */
const REPO_ONLY = [
  ['pnpm ', 'a command only this workspace has'],
  ['examples/', 'a retired repository-only demo path'],
  ['scripts/', 'a path only this repository has'],
  ['Starter', 'this file’s Figma plan tier'],
]

const problems = []

// --- 1. the two versions agree -------------------------------------------
const pkg = JSON.parse(await readFile(join(PLUGIN, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'))
if (pkg.version !== manifest.version) {
  problems.push(
    `plugin.json says ${manifest.version}, package.json says ${pkg.version}.\n` +
      '    They ship together, so they version together.',
  )
}
for (const entry of ['skills', '.claude-plugin']) {
  if (!pkg.files?.includes(entry)) {
    problems.push(`package.json "files" does not include "${entry}", so it will not be published.`)
  }
}

// --- 2. every command and flag named in a skill exists --------------------
const help = async (args) => (await run(process.execPath, [CLI, ...args, '--help'])).stdout
const flagsIn = (text) => new Set(text.match(/--[a-z][a-z-]*/g) ?? [])

const rootHelp = await help([])
const commands = new Set(
  (rootHelp.split(/^Commands:$/m)[1] ?? '')
    .split('\n')
    .map((line) => /^\s{2}([a-z][a-z-]*)/.exec(line)?.[1])
    .filter(Boolean),
)
const globalFlags = flagsIn(rootHelp.split(/^Commands:$/m)[0] ?? '')
const commandFlags = new Map()
for (const command of commands) {
  if (command === 'help') continue
  commandFlags.set(command, new Set([...globalFlags, ...flagsIn(await help([command]))]))
}

const files = []
for (const dir of await readdir(SKILLS, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue
  const base = join(SKILLS, dir.name)
  files.push(join(base, 'SKILL.md'))
  const refs = join(base, 'references')
  await readdir(refs)
    .then((names) => files.push(...names.map((n) => join(refs, n))))
    .catch(() => {})
}

// A subcommand word may sit between the verb and its flags (`theme color
// --apply`); without allowing for it the flags after one go unchecked.
const INVOCATION = /figma2react\s+([a-z][a-z-]*)((?:\s+(?:[a-z][a-z-]*|--[a-z][a-z-]*))*)/g
for (const file of files) {
  const text = await readFile(file, 'utf8')
  const where = relative(ROOT, file)
  for (const [, command, rest] of text.matchAll(INVOCATION)) {
    if (!commands.has(command)) {
      problems.push(`${where}: \`figma2react ${command}\` is not a command.`)
      continue
    }
    for (const flag of flagsIn(rest)) {
      if (!commandFlags.get(command)?.has(flag)) {
        problems.push(`${where}: \`${command}\` has no ${flag} flag.`)
      }
    }
  }

  for (const [needle, why] of REPO_ONLY) {
    if (text.includes(needle)) {
      problems.push(`${where}: mentions "${needle.trim()}" — ${why}. It cannot ship.`)
    }
  }
}

// --- 3. paths the repo-local skill names still exist ----------------------
// The shipped skills are guarded by REPO_ONLY above; the repo-local one is
// *supposed* to name repo paths, so the only thing that can go wrong is that
// they stop existing. That is exactly what happened when `examples/` was
// retired and the skill kept pointing at it.
const LOCAL = join(ROOT, '.claude/skills')
const localFiles = []
for (const dir of await readdir(LOCAL, { withFileTypes: true }).catch(() => [])) {
  if (!dir.isDirectory()) continue
  const base = join(LOCAL, dir.name)
  localFiles.push(join(base, 'SKILL.md'))
  await readdir(join(base, 'references'))
    .then((names) => localFiles.push(...names.map((n) => join(base, 'references', n))))
    .catch(() => {})
}

// Only backticked tokens that look like a repo path: a slash, and either a file
// extension or a trailing slash. Prose is not checkable; these are.
const PATHISH = /`([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.*-]+)+\/?)`/g
for (const file of localFiles) {
  const text = await readFile(file, 'utf8')
  const where = relative(ROOT, file)
  for (const [, candidate] of text.matchAll(PATHISH)) {
    if (candidate.includes('*')) continue // a glob, not a path
    if (!/\.[a-z]+$|\/$/.test(candidate)) continue
    if (!existsSync(join(ROOT, candidate))) {
      problems.push(`${where}: names \`${candidate}\`, which does not exist.`)
    }
  }
}

// --- report ---------------------------------------------------------------
if (problems.length) {
  console.error(`\nThe shipped skills disagree with the CLI (${problems.length}):\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('')
  process.exit(1)
}
console.log(
  `Skills match the CLI: ${files.length} file(s), ${commands.size} command(s), versions agree.`,
)
