import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { Layer } from '@figma-to-react/core'

export type OutputLayer = Layer | 'theme'
export type OutputDirectories = Partial<Record<OutputLayer, string>>

/**
 * `design-system.json` — the one place this repo's design-system context lives:
 * which Figma file, which frame, where the output goes, and how the components
 * are sorted. Written by `figma2react init` rather than by hand, so the values
 * that matter are never a half-remembered URL.
 */
export interface DesignSystemConfig {
  /** Bumped per generation; see docs/design-system-versions.md. */
  version?: string
  file: { key: string; node?: string; name?: string }
  /** Legacy single output, or one consumer package source directory per layer. */
  out?: string | OutputDirectories
  gen?: {
    traceIds?: boolean
    stories?: boolean
    fidelityThreshold?: number
    minUses?: number
    layout?: 'flat' | 'atomic'
  }
  atomic?: {
    /** Fallback for components the Figma file cannot express a layer for. */
    layers?: Record<string, Layer>
    /** `default` applies to anything without an entry of its own. */
    ownership?: Record<string, string>
  }
  offline?: { fixture?: string }
  conventions?: Record<string, string>
}

export const CONFIG_FILE = 'design-system.json'

export async function readConfig(path = CONFIG_FILE): Promise<DesignSystemConfig | undefined> {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8')) as DesignSystemConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

export async function writeConfig(config: DesignSystemConfig, path = CONFIG_FILE): Promise<void> {
  const full = resolve(path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, `${JSON.stringify(config, null, 2)}\n`)
}

/** The target string `gen`, `tokens` and `audit` accept, rebuilt from config. */
export const targetOf = (c: DesignSystemConfig): string =>
  c.file.node ? `${c.file.key}:${c.file.node}` : c.file.key

export function outputDirectory(
  config: DesignSystemConfig | undefined,
  layer?: OutputLayer,
): string | undefined {
  if (!config?.out) return undefined
  if (typeof config.out === 'string') return config.out
  return layer ? config.out[layer] : undefined
}

/** Ownership with `default` split out, which is how the audit wants it. */
export function ownership(c: DesignSystemConfig | undefined): {
  ownership?: Record<string, string>
  defaultOwnership?: string
} {
  const all = c?.atomic?.ownership
  if (!all) return {}
  const { default: fallback, ...rest } = all
  return { ownership: rest, defaultOwnership: fallback }
}
