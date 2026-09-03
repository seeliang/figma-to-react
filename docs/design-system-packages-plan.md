# Phase 2b — split the design system into per-layer packages

## Context

Everything generated currently lands in one directory inside one app: `examples/src/design-system/`,
21 files, sharing one `vite.config.ts`, one Storybook, one `styles.css`, one `tokens.json`. That
was right while there was one output. It stops being right the moment atoms and molecules need to
version and release separately — which is the stated reason for wanting NX.

**Intended outcome:** four workspace packages, one per atomic layer, each independently buildable,
regenerable and verifiable, with the layer dependency direction enforced by the package graph
rather than by an audit rule.

### Decisions taken

|             |                                                                                        |
| ----------- | -------------------------------------------------------------------------------------- |
| Granularity | **One package per layer** — `@ds/theme`, `@ds/atoms`, `@ds/molecules`, `@ds/organisms` |
| Storybook   | **One root Storybook**, globbing every package. See the trade-off below                |
| Config      | **Shared preset** (`@ds/config`) with three-line files per package                     |
| NX          | **Design for it now, add it last.** The split is the prerequisite — see why below      |

---

## What to optimize

You asked what to optimize. In priority order, and the first one is the reason to do this at all.

### 1. Make the layer boundary a compile error

Today `layer-dependency-violation` is an audit finding read off Figma data. After the split it
becomes a build failure: `@ds/atoms` cannot import from `@ds/molecules` because that package is not
in its `dependencies`. The rule stops depending on anyone running the audit.

This only works if generated cross-layer imports become **package imports**. Today
`form-field.tsx` does:

```ts
import { InputFieldDefault } from './input-field-default.js'
```

It has to become `from '@ds/atoms'`. That is the single most substantial code change in this plan,
and it lives in `packages/emit-react/src/emit.ts` where component imports are written.

Without it, everything else is cosmetic: the files move, the relative imports still reach across
layer boundaries, and NX still sees one blob.

### 2. Give NX a real graph to work with

NX's affected-detection and independent versioning both key off the package graph. "Change an atom,
release two packages at two versions" requires that `@ds/molecules` declares a dependency on
`@ds/atoms` — otherwise NX cannot know the molecule is affected, and cannot know it is _not_
affected when only a molecule changes.

So the graph is the deliverable, not `nx.json`:

```
@ds/theme  ←  @ds/atoms  ←  @ds/molecules  ←  @ds/organisms
```

Every package depends on `@ds/theme`; each component layer depends on the one below. Adding NX
afterwards is then a config file, not a restructure.

### 3. Make the theme the single owner of tokens

All three component packages depend on `@ds/theme` for `tokens.css`, `fonts.css` and `tokens.json`.
One owner permanently removes the collision class that `verify-tokens.mjs` currently reports — two
`@theme` blocks declaring `--color-blue-600` at different values, resolved by import order.

Related: **move `examples/src/generated/` out**. Those three files come from a completely different
Figma document (the card fixture) and are the other half of that collision. They belong in a test
fixture app, not beside the design system.

### 4. Kill the config duplication before it starts

Four packages × (`vitest.config.ts`, `.storybook/vitest.setup.ts`, `tsconfig.json`, a 16-entry
devDependency block) is four places for the same bug. This repo has already been bitten twice by
one config silently differing from another — a missing Tailwind plugin in `vitest.config.ts` made
every story fail by ~57px, and a misordered `@import` dropped the webfont silently.

`@ds/config` exports the Vite, Vitest and Storybook presets; each package holds a three-line file
that spreads them. One fix, one place.

**Found while building step 1:** the dependency list hoists less far than the config does. Storybook
resolves addons _by name from the project root_, and its Vitest plugin injects
`@storybook/addon-vitest/internal/*` into `optimizeDeps.include` — both look in the consuming
package's `node_modules`, where a package that only exists in `@ds/config`'s tree is invisible.
So `@storybook/addon-designs`, `@storybook/addon-vitest`, `@vitest/browser-playwright` and
`playwright` have to stay declared per package. Only what the preset code _imports directly_
(`@tailwindcss/vite`, `@vitejs/plugin-react`) actually moves. The shared config is still the win —
it is the plugin _wiring_ that has bitten this repo, not the dependency list.

### 5. Regeneration becomes assertable per package

`git diff --exit-code packages/ds-atoms/src` after `pnpm ds:gen --layer atoms` is the real
idempotence gate, and it becomes four independent gates instead of one. That is what "easily verify
regenerate" means concretely.

---

## The trade-off in one root Storybook

You picked one root Storybook, and it is the pragmatic choice: four Storybooks means four copies of
the 16-package devDependency block, and `refs` composition requires each one to be _served at a
URL_, not read from a directory.

What it costs: a package cannot have its stories verified alone. Per-package verification still
covers build, typecheck, token drift and regeneration idempotence — but the story tests stay global.

If per-package story tests matter later, the cheaper route than `refs` is one Vitest **project per
package** in the root config, each pointing at the same `.storybook` with a narrowed story glob.
Worth knowing; not in this plan.

---

## Layout

```
packages/
  core/ emit-react/ emit-storybook/ cli/        the tool, unchanged
  ds-config/          shared Vite / Vitest / Storybook / TS presets
  ds-testing/         fidelity + token assert helpers
  ds-theme/           tokens.css · fonts.css · tokens.json · theme.stories.tsx
  ds-atoms/           Button, Input Field          → depends on theme
  ds-molecules/       Form Field                   → depends on theme, atoms
  ds-organisms/       (empty today)                → depends on theme, atoms, molecules
examples/
  .storybook/         one root Storybook, globbing ../packages/ds-*/src
  src/                the gallery, importing from @ds/* by name
  fixtures/           the card fixture, moved out of src/generated
```

`@ds/organisms` is generated empty — the file has no full-width component. Creating it anyway keeps
the graph complete and means the first organism needs no new package.

## What has to be re-plumbed

Five things are hardcoded to the single-directory assumption:

| Where                                                                             | What                                                             | Becomes                                                                                                  |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/pipeline.ts:170,177`                                            | `helperPath: '../fidelity/assert.js'` / `'../theme/assert.js'`   | `@ds/testing`, threaded from config — `emitThemeStory` already takes the option, it is just never passed |
| `packages/emit-react/src/emit.ts`                                                 | cross-component imports as relative paths                        | package specifier when the target is in another layer                                                    |
| `scripts/ds.mjs:146-151`                                                          | `--layer` writes a **subdirectory** of one `out`                 | routes to that layer's package                                                                           |
| `design-system.json:8`                                                            | `"out": "examples/src/design-system"`                            | a map of layer → package src dir                                                                         |
| `scripts/verify-styles.mjs:15`, `verify-tokens.mjs:97`, root `package.json:12,19` | hardcoded `examples/` paths and a four-times-repeated `--filter` | derived from config; `verify` becomes a loop                                                             |

Also: `examples/src/fidelity/assert.ts:1` imports `../design-system/figma-geometry.json` — a helper
reaching into generated output. Moving it to `@ds/testing` means the geometry has to be passed in
rather than imported, or the helper is duplicated four times.

And `packages/cli/test/e2e.test.ts:237-243` borrows React and Storybook type declarations out of
`examples/node_modules`. That keeps working, but it now points at a package whose role has changed;
point it at `@ds/config` instead.

---

## Files

| Path                                             | Change                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/ds-config/`                            | new — `vite.ts`, `vitest.ts`, `storybook.ts`, `tsconfig.json` presets            |
| `packages/ds-testing/`                           | new — `fidelity/assert.ts` (geometry injected), `theme/assert.ts` moved verbatim |
| `packages/ds-{theme,atoms,molecules,organisms}/` | new — `package.json`, thin configs, generated `src/`                             |
| `packages/emit-react/src/emit.ts`                | cross-layer imports become package specifiers                                    |
| `packages/cli/src/pipeline.ts`                   | per-layer routing; `helperPath` from options                                     |
| `packages/cli/src/config.ts`                     | `out` as a layer map                                                             |
| `scripts/ds.mjs`                                 | `--layer` targets a package                                                      |
| `scripts/verify-{styles,tokens}.mjs`             | walk the configured packages, not hardcoded dirs                                 |
| `package.json`                                   | `verify` loops over packages; `typecheck` uses a solution tsconfig               |
| `pnpm-workspace.yaml`                            | unchanged — `packages/*` already covers the new packages                         |
| `examples/`                                      | gallery imports `@ds/*`; card fixture moves to `examples/fixtures/`              |

## Build order

1. `@ds/config` and `@ds/testing`. Nothing generated yet — prove the presets work by pointing the
   existing `examples/` at them and confirming `pnpm verify` is still green.
2. Package specifiers for cross-layer imports in `emit-react`, with snapshot tests. This is the
   change that makes the boundary real; do it before anything moves.
3. `design-system.json` `out` as a layer map, and per-layer routing in the pipeline and `ds.mjs`.
4. Generate into the four packages. Delete `examples/src/design-system/`.
5. Re-point the root Storybook glob, `styles.css`, and the gallery.
6. Rework `verify` into a per-package loop; add the four idempotence gates.
7. Move the card fixture out of `src/generated/`.
8. `nx.json` and per-package targets — last, once the graph is real.

Steps 1–2 are safe on their own. Step 4 is the irreversible one.

## Verification

1. **`pnpm verify` green throughout.** It should never go red for more than one step.
2. **The boundary holds.** Add an import of `@ds/molecules` to a file in `@ds/atoms` and confirm
   `tsc` fails. This is the whole point of the split; assert it rather than assume it.
3. **Regeneration is byte-stable, per package.** `pnpm ds:gen` then
   `git diff --exit-code packages/ds-*/src` — four gates, all clean.
4. **One layer regenerates alone.** `pnpm ds:gen --layer atoms` touches only `ds-atoms`, confirmed
   by `git status`.
5. **The collision is gone.** `verify-tokens.mjs` should report no duplicate declarations once the
   card fixture is out — and its `checkCollisions` then has no subject, so keep it pointed at the
   root stylesheet to catch a future one.
6. **Story tests still pass** — 13 today, unchanged by a file move.
7. **NX sees the graph.** After step 8, `nx graph` shows theme ← atoms ← molecules ← organisms, and
   changing an atom marks molecules affected while changing a molecule does not mark atoms.

## Out of scope

Publishing to a registry · `refs`-based Storybook composition · per-package story tests · a package
per component (the article's end state; the layer split is the step before it) · CI pipelines beyond
whatever NX config lands in step 8 · dark-mode or multi-mode token sets.
