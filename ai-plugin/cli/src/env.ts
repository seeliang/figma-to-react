import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { CONFIG_FILE } from './config.js'

/**
 * Ambient filesystem reads live here rather than in `@figma-to-react/core`.
 * The libraries stay pure — a library that reaches for `.env` is hard to test —
 * but this package is a bin, and a CLI that cannot find the token sitting next
 * to its own config is just a CLI that makes you type the token every time.
 */

/**
 * Walks up from `from` looking for `design-system.json`, so the commands work
 * from anywhere in a workspace rather than only from the directory holding the
 * config. Returns an absolute path, or undefined if there is no config to find.
 */
export async function findConfig(
  explicit?: string,
  from: string = process.cwd(),
): Promise<string | undefined> {
  if (explicit && explicit !== CONFIG_FILE) return resolve(explicit)

  let dir = resolve(from)
  for (;;) {
    const candidate = join(dir, CONFIG_FILE)
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      /* keep walking */
    }
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Loads `.env` from the directory holding the config, then from the working
 * directory. Existing environment variables always win: an exported token is a
 * deliberate override, and a file should never silently beat one.
 */
export async function loadEnv(configPath?: string): Promise<void> {
  const dirs = [configPath ? dirname(configPath) : undefined, process.cwd()].filter(
    (d): d is string => Boolean(d),
  )

  for (const dir of new Set(dirs)) {
    let text: string
    try {
      text = await readFile(join(dir, '.env'), 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
    for (const line of text.split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      const [, key, raw] = match
      process.env[key!] ??= raw!.trim().replace(/^["']|["']$/g, '')
    }
  }
}
