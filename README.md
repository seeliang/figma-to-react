# figma-to-react

Generate Tailwind-styled React components from a Figma frame, over the Figma REST API.

```bash
export FIGMA_TOKEN=figd_...
pnpm figma2react gen 'https://www.figma.com/design/AbC123/My-File?node-id=1-2' --out src/components
```

```
src/components/
  card.tsx            <- the frame
  button-primary.tsx  <- each component, generated once and imported
  tokens.css          <- a Tailwind @theme block
  assets/             <- raster fills
```

## Why this exists

Walking Figma's node JSON and printing JSX is a solved problem — [`kazuyaseki/figma-to-react`](https://github.com/kazuyaseki/figma-to-react) and Figma's own [`figma-api-demo`](https://github.com/figma/figma-api-demo) both do it, as do Builder.io, Locofy and the official [Figma MCP server](https://developers.figma.com/docs/figma-mcp-server/).

What none of them do well is **token resolution**. Every tool emits `bg-[#3b82f6]` and `p-[24px]`, which is why generated code gets thrown away. This one lifts values into a real theme:

```tsx
<div className="flex flex-col gap-4 w-80 p-6 bg-surface-raised rounded-lg">
```

```css
@theme {
  --color-surface-raised: #ffffff;
  --color-heading-small: #0f1729;
}
```

Naming, in priority order:

1. **Figma Styles** — `Surface/Raised` becomes `--color-surface-raised`. Style names ship in the file-nodes response on every plan, so this is the common case for design-system files.
2. **Figma Variables** — the [Variables REST API is Enterprise-only](https://developers.figma.com/docs/rest-api/variables-endpoints), so the name is usually unavailable. The variable _id_ is still a correct grouping key, so every node bound to one variable gets one shared, synthesised name.
3. **Frequency** — an unnamed colour used `--min-uses` times or more earns a theme entry, named from its own colour against Tailwind's ramp (`#2563eb` → `blue-600`), deterministically, so re-running produces the same names.

Naming uses **chroma** to decide whether something is a grey, and **CIE L\*** to place it on the ramp. Both matter: HSL saturation calls `#0f172a` a 47%-saturated blue, which would name a plain slate `blue-950` and stand it beside a genuinely blue `blue-600`; and HSL lightness is not comparable across hues, drifting green two to three steps.

Spacing, radii and type sizes are deliberately **not** named by frequency. Tailwind's scale already covers them, and inventing `--spacing-7` where `p-7` exists makes the output worse.

## Commands

```
figma2react gen <figma-url> --out <dir>     generate components
figma2react tokens <figma-url>              print the @theme block
figma2react inspect <figma-url>             dump the IR as JSON
```

Accepts a full Figma URL, a bare file key, or `<fileKey>:<nodeId>`. Node ids are converted from the URL form (`1-2`) to the API form (`1:2`) automatically.

| Flag                     |                                                                   |
| ------------------------ | ----------------------------------------------------------------- |
| `-t, --token`            | Figma PAT. Defaults to `$FIGMA_TOKEN`                             |
| `--no-tokens`            | Emit literal values instead of a theme                            |
| `--no-assets`            | Skip SVG export and image download                                |
| `--min-uses <n>`         | Uses before an unnamed colour earns a theme entry (default 3)     |
| `--repeat-threshold <n>` | Identical siblings before collapsing into `.map()` (default 3)    |
| `--no-semantics`         | Emit plain divs instead of inferring `<button>`, `<input>`, `<a>` |
| `--no-design-notes`      | Skip the report of gaps in the Figma file itself                  |
| `--dry-run`              | Print what would be written                                       |

`inspect` is the debugging workhorse: it shows exactly what the normalizer made of a frame without spending API calls on a full generate. `--raw` dumps the untouched API response instead.

`$FIGMA_API_BASE` overrides the API host, for Figma Government tenants and for tests.

## Wiring up the theme

`tokens.css` is a **fragment**, not an entry point. Import it from your own stylesheet:

```css
@import 'tailwindcss';
@import './generated/tokens.css';
```

Order matters. And if the generated directory is gitignored — most are — Tailwind v4 will not scan it, so none of the generated classes reach your bundle. The build still succeeds; the page just renders unstyled. Add an explicit source glob:

```css
@source './generated/*.tsx';
```

A bare directory path (`@source './generated'`) does **not** override gitignore. It has to be a glob.

## What it does with a design

| Figma                                     | Output                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Auto Layout                               | flexbox — direction, `gap`, padding, `justify-*`, `items-*`          |
| `layoutSizing` FIXED / HUG / FILL         | fixed width, nothing, or `flex-1` / `w-full` depending on axis       |
| No Auto Layout                            | absolute positioning against the parent's bounding box               |
| Components (incl. variant sets)           | one file per component; `Button` + `Type=Primary` -> `ButtonPrimary` |
| Instances                                 | a tag importing that component, with text passed as props            |
| Text inside a component                   | an optional prop, defaulting to the design's own copy                |
| Layer named `Button` / `Input` / `Link`   | a real `<button>`, `<input>` or `<a>` (`--no-semantics` to disable)  |
| Interactive elements                      | `cursor-pointer`, which Tailwind v4 Preflight otherwise removes      |
| Ellipses                                  | `rounded-full` — Figma encodes roundness as node type, not a radius  |
| Font family                               | a `--font-*` theme entry with a fallback stack                       |
| Vectors and icon groups                   | inline SVG, converted to valid JSX                                   |
| Image fills                               | downloaded to `assets/`, rendered as `<img>`                         |
| Invisible layers, masks                   | dropped                                                              |
| ≥3 identical siblings with differing text | collapsed into a `.map()`                                            |

Older files that predate `layoutSizingHorizontal` fall back to `layoutGrow`, `layoutAlign` and `counterAxisSizingMode`.

## Storybook

```bash
figma2react gen '<url>' --out src/design-system --stories --trace-ids
pnpm --filter figma-to-react-example storybook
```

`--stories` writes one CSF 3 story file per **variant set** — `Button/Primary`,
`Secondary` and `Ghost` become three stories under one `Design System/Button`
title — with `args` taken from the design's own copy, so the controls panel is
populated from the file rather than by hand.

Each story carries `parameters.design`, so
[`@storybook/addon-designs`](https://github.com/storybookjs/addon-designs) shows
the exact Figma node beside the component. The node id is already known, so the
pairing is free.

The design panel needs the **real file key** in the URL, which means generating
against the real API — or, when working offline against a recorded fixture,
passing the real key anyway (`<realKey>:<nodeId>`), since the fixture server
ignores it. A placeholder key produces a panel that reports the file as
inaccessible, which reads exactly like a permissions problem and is not one.

Stories are **build output**. They are overwritten on every run; hand-written
stories belong in a sibling `*.custom.stories.tsx`, which the generator never
touches.

One honest limitation: variants are still separate components, so only the
first can be a story's `meta.component`. The rest render explicitly, and where
a variant's props diverge from the meta component's — three input states whose
text layers are named `Placeholder text`, `Input value` and `Invalid input` —
its values are passed literally instead of through `args`, because `Story` is
typed from `meta.component` and would not otherwise compile.

### Fidelity as a test

`--stories` also emits `figma-geometry.json`, and each story gets a play
function:

```tsx
play: async ({ canvasElement }) => {
  await expectLayoutWithin(canvasElement, 4)
}
```

`pnpm --filter figma-to-react-example test-storybook` runs every story in a real
browser through `@storybook/addon-vitest` and fails when any node drifts past
the threshold. Layout drift stops being something to notice and becomes
something that breaks the build.

It needs `--trace-ids`; without it there is no `data-figma-id` to match on, the
CLI says so, and the assertion refuses rather than passing vacuously.

### Measuring layout fidelity

Comparing generated output against the Figma frame by eye catches bugs, but only
the ones big enough to notice. To measure it instead, generate with
`--trace-ids` — every element then carries `data-figma-id` — and open
`examples/fidelity.html`, which mounts the root unscaled and diffs every node's
`getBoundingClientRect()` against the `absoluteBoundingBox` Figma reported.

```
57 nodes compared
  within 1px   35 (61%)
  within 2px   52 (91%)
  within 4px   57 (100%)
```

Three bugs came out of this that no amount of looking had found: hugging text
rendered 332px too wide, a stale `layoutAlign` stretched an input to its
container, and Figma's "Auto" line height resolved about 3px per line
differently in the browser — invisible per node, tens of pixels down a column.

A fourth came out of it too: the residual few px of text width looked like
unavoidable font rasterisation, but was the _wrong version_ of the typeface —
the locally installed Inter, not the one Figma used. Loading the real webfont
took every node inside 4px.

`--trace-ids` is debug output and off by default.

### Design notes

After generating, the CLI reports what is missing **from the Figma file** — kept
separate from its own warnings, and worded as a design issue on purpose. These
are gaps no amount of code can close, because the information was never put in
the file:

```
Design file — 6 thing(s) to fix in Figma, not in code:

  !! 75 colours bound to no Style or Variable, so token names are synthesised
     (--color-blue-600 rather than --color-primary)
     fix: select the swatch and create a Colour Style, or bind a Variable.

   ! 1 interactive component with no hover, pressed or disabled variant, so the
     generated element has no state styling
     fix: add a Hover / Pressed / Disabled variant. Nothing else can supply it —
     a hover colour the designer never chose would be invented, not generated.
```

It checks for unbound colours, unbound font sizes, containers without Auto
Layout, variant sets whose members drift in width, interactive components with
no state variants, and text layers still auto-named after their own content.
`--no-design-notes` silences it.

### Rate limits

Figma meters REST access **by plan tier**, and the quota is not a burst window — a Starter account that runs out is told to come back in _days_. The client fails fast on that rather than sleeping through it, and reports the plan and the wait:

```
error: Figma rate limit exceeded on the starter plan. Quota resets in 4.6 days.
```

Short waits are still retried with backoff. Requests time out after 30s.

### Known trade-offs

- **Hover and pressed states are not invented.** Figma only carries what the designer drew. If a component set has a variant named `Hover` or `Pressed`, nothing currently maps it to a `hover:` / `active:` class — and if it doesn't, there is no honest source for one. The cursor is different: it follows from the element being a control, not from the design.
- **Element inference is name-based.** A layer called `Button` becomes a `<button>`; one called `CTA Container` does not. The rule only fires when the node's whole subtree is a single text leaf, so a wrapper like `Form Field` is left alone. It can misfire — `--no-semantics` turns it off.
- **Variable names need Enterprise.** On other plans the variables endpoint is unavailable, so a bound Variable contributes a grouping key but no name. Colour **Styles** carry names on every plan — prefer them if you want `--color-primary` over `--color-blue-600`.
- **Stacked paints** collapse to the topmost visible one; CSS has no clean equivalent. `inspect` shows the full node when a design depends on them.
- **Text becomes props only up to a point.** Figma auto-names text layers after their own content, so a spec sheet with 50 labels would otherwise yield 50 props named things like `n2563Eb`. Past 12 text leaves a node is treated as a page, not a parameterised component, and its copy is emitted literally.
- **Variants are separate components, not a prop union.** `Type=Primary` and `Type=Ghost` become `ButtonPrimary` and `ButtonGhost`. Collapsing them into one `Button` with a `type` prop is a v2 item.
- **Synthesised colour names approximate Tailwind's ramp, they do not reproduce it.** Family and ordering are reliable; the step lands within one of the real ramp. The point is a stable, readable name, not a palette match.
- **Heading levels** come from font size alone (`≥32px` → `h1`, `≥24` → `h2`, `≥18` → `h3`), because Figma carries no semantic signal. Expect to fix some by hand.
- **Text styles become colour tokens.** A `Heading/Small` text style yields `--color-heading-small`, since the colour is the only part of it the REST API exposes per-node.
- Gradients other than linear degrade to their nearest CSS equivalent.

## Development

```bash
pnpm install
pnpm verify        # build, typecheck, test, example build, style check
```

Four stages, each a pure function, each independently testable:

```
Figma URL
  → fetch      tools/core/src/figma      → node JSON
  → normalize  tools/core/src/ir         → IR
  → tokens     tools/core/src/tokens     → @theme + a resolver
  → emit       tools/emit-react          → TSX
```

The **IR** (`tools/core/src/ir/types.ts`) mentions no framework, no CSS and no Tailwind. An emitter for Vue or React Native is a new package consuming those types, not a rewrite.

Tests never touch the network. `tools/core/test/fixtures/` holds API-shaped responses; the CLI suite runs the real binary against a local fixture server.

Three gates beyond the unit tests, each of which has already caught a real bug:

- `tsc --noEmit` on the **generated** output, strict, `noUnusedLocals`. Caught a declared-but-unused prop on a nested component.
- `scripts/verify-styles.mjs` checks every generated class resolves to a CSS rule in the built bundle. Caught Tailwind silently scanning nothing while the build reported success.
- Snapshots on the emitter, to keep class ordering and naming stable.

### An LLM pass

There isn't one, and `gen` is fully deterministic. `emit()` takes an optional `refine?: (ir: IRNode) => Promise<IRNode>` hook that runs between normalize and emit, which is where semantic renaming or prop extraction would go.

### Fixtures

`tools/core/test/fixtures/*.json` are hand-authored to the documented API shapes rather than recorded, since the repo has no token. Re-record them against a real file with:

```bash
figma2react inspect '<url>' --raw > tools/core/test/fixtures/card.json
```

## Not in v1

Figma plugin frontend · [Code Connect](https://developers.figma.com/docs/code-connect) generation · non-React emitters · the Enterprise Variables endpoint · component variants as prop unions · responsive breakpoints from Figma constraints.
