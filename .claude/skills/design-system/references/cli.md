# CLI reference

Two layers. `figma2react` is the general-purpose tool; `scripts/ds.mjs` is this repo's wrapper,
which loads `.env`, resolves `design-system.json`, and defaults to offline. **Prefer the wrapper** —
the raw CLI needs a token and a URL every time.

## The wrapper

```
node scripts/ds.mjs init   [--live] [--yes] [--from <url>] [-o <dir>]
node scripts/ds.mjs gen    [--offline] [--layer atoms|molecules|organisms|theme]
node scripts/ds.mjs tokens [--live] [-o <file>]
node scripts/ds.mjs audit  [--live] [--json]
```

Or `pnpm ds:init | ds:gen | ds:tokens | ds:audit`.

`audit` defaults to **offline**; `gen` defaults to **live**, because generating from a stale
recording produces code that does not match the file. Pass `--offline` to `gen` deliberately —
for example when the quota is spent, or when only the layer sorting changed.

## The tool

```
figma2react gen    <figma-url> --out <dir>   generate components
figma2react audit  [figma-url]               report design-file gaps; --json for machine output
figma2react init                             ask for the generate area, write design-system.json
figma2react tokens <figma-url>               print the @theme block
figma2react inspect <figma-url> [--raw]      dump the IR, or the untouched API response
```

Targets accept a full Figma URL, a bare file key, or `<fileKey>:<nodeId>`. URL-form node ids
(`2-77`) convert to API form (`2:77`) automatically.

### `gen` flags worth knowing

| Flag              | Why it matters                                                                        |
| ----------------- | ------------------------------------------------------------------------------------- |
| `--trace-ids`     | emits `data-figma-id`; **the fidelity check asserts nothing without it**              |
| `--stories`       | writes `*.stories.tsx` and `figma-geometry.json`                                      |
| `--layout atomic` | _(Phase 2)_ emits `atoms/ molecules/ organisms/ theme/` instead of one flat directory |
| `--dry-run`       | prints the write plan and touches nothing                                             |
| `--config <file>` | where layers and ownership come from; defaults to `design-system.json`                |

## What `gen` writes

```
<out>/
  design-system.tsx        the root frame
  button-primary-hover.tsx one file per component variant
  button.stories.tsx       one per variant set, with --stories
  figma-geometry.json      what the fidelity check measures against
  fonts.css                must be imported before anything else
  tokens.css               the Tailwind @theme block
```

`gen` does **not** delete files it no longer generates. When a variant is renamed in Figma the old
file stays behind and still compiles. Check `git status` after generating and remove orphans.

## Errors

- **`Figma rate limit exceeded on the starter plan`** — the quota, not a bug. The message names
  when it resets. Use `--offline` until then.
- **`Figma returned no node <id> in file <key>`** — wrong node id, or the token cannot read it.
- **`No Figma token`** — `.env` holds it; the wrapper loads it, the raw CLI does not.

Everything exits `1`; there are no per-error codes.

## Verification

`pnpm verify` runs the whole chain: build, typecheck, unit tests, the example build, the
generated-class check, the Storybook build, and the story fidelity tests. Three of those gates
exist because they each caught a bug that eyeballing missed — do not skip to a subset.
