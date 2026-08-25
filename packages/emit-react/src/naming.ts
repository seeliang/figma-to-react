/**
 * Figma layer names are free text: `Button/Primary`, `icon / chevron-down`,
 * `Frame 1234`, `🔥 Hero`. Turning them into valid, stable, non-colliding
 * React identifiers is fiddly enough to deserve its own module.
 */

const RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'await',
  'async',
  // Not reserved, but shadowing these in generated code is never what anyone wants.
  'React',
  'Fragment',
  'Component',
  'Props',
])

/**
 * `Button/Primary` → `ButtonPrimary`. Variant paths are flattened rather than
 * dropped: two variants of one component must not collide on a single name.
 */
export function toPascalCase(raw: string): string {
  const cleaned = raw
    // Strip anything that cannot appear in an identifier, keeping word breaks.
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  if (!cleaned) return 'Component'

  const pascal = cleaned
    .split(/\s+/)
    .map((word) => splitCamel(word).map(capitalize).join(''))
    .join('')

  // Identifiers cannot start with a digit — `1 Column` would be invalid.
  const safe = /^\p{N}/u.test(pascal) ? `N${pascal}` : pascal
  return RESERVED.has(safe) ? `${safe}Component` : safe
}

/** `label` → `label`, `Icon Left` → `iconLeft`. For prop names. */
export function toCamelCase(raw: string): string {
  const pascal = toPascalCase(raw)
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1)
  return RESERVED.has(camel) ? `${camel}Prop` : camel
}

/** Preserve existing camelCase word boundaries that a naive split would lose. */
function splitCamel(word: string): string[] {
  return word.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2').split(' ')
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

/**
 * Hands out unique names, remembering what each source id was already given so
 * repeat lookups stay stable. Two different layers called `Card` become `Card`
 * and `Card2`.
 */
export class NameRegistry {
  private readonly taken = new Set<string>()
  private readonly assigned = new Map<string, string>()

  constructor(reserved: Iterable<string> = []) {
    for (const name of reserved) this.taken.add(name)
  }

  /** Stable per `id`: calling twice with the same id returns the same name. */
  claim(id: string, rawName: string): string {
    const existing = this.assigned.get(id)
    if (existing) return existing

    const base = toPascalCase(rawName)
    let name = base
    let n = 2
    while (this.taken.has(name)) name = `${base}${n++}`

    this.taken.add(name)
    this.assigned.set(id, name)
    return name
  }

  has(name: string): boolean {
    return this.taken.has(name)
  }
}

/** `ButtonPrimary` → `button-primary.tsx` — kebab file names, PascalCase exports. */
export function toFileName(componentName: string): string {
  return `${componentName.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1-$2').toLowerCase()}.tsx`
}
