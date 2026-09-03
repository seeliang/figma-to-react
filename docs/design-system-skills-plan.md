# Design-system skills for figma-to-react

## Context

The repo has a working CLI (`figma2react gen | tokens | inspect`), an audit that reports
design-file gaps, and a Storybook fidelity suite. All of it is driven by hand: someone has to
remember the file key, remember that `.env` is never auto-loaded, remember that the Starter-tier
quota is spent and the fixture server must be used instead, and remember to pass `--trace-ids`
or the fidelity assertions pass vacuously.

The ask is to put that knowledge into a Claude Code skill so the CLI can be driven by intent
("regenerate the button", "is this Developer Ready?") rather than by recalled invocations — and
to extend the same harness to atomic layering, accessibility, e2e, coverage and security, with
reusable sub-skills.

**Intended outcome:** one `/design-system` entry point that routes to focused, independently
invocable sub-skills, each a thin wrapper over a deterministic repo script. Every fact the skill
needs is computed, not memorised.

### Decisions taken

|                  |                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context lives in | **`design-system.json` at the repo root** — file key, node id, out dir, gen flags, offline fixture. Read by scripts, never restated in prose                                              |
| Skills are       | **Thin over scripts.** `scripts/ds.mjs` and npm scripts hold the logic; SKILL.md holds routing, judgement, and reporting rules only                                                       |
| Slash command    | **`user-invocable: true` on the router skill.** This _is_ the slash command — see the note below                                                                                          |
| Sub-skills       | Ten, `ds-` prefixed so they group in the `/` list; each usable on its own or via the router. Four of them are one-per-layer: theme, atoms, molecules, organisms                           |
| Sequencing       | **Three phases — Runnable, Layered, Gated.** Each ends with something that works on its own                                                                                               |
| Atomic model     | **Three layers — Atoms, Molecules, Organisms — with Theme separate**, per your own write-up. The CLI suggests the layer with its evidence; a human confirms it; the code then verifies it |
| Entry point      | **`figma2react init`** asks for the generate area and writes `design-system.json`. Nothing assumes a file key it was not given                                                            |
| Version record   | **`docs/design-system-versions.md`**, appended per generation — Figma file version, layer counts, audit and fidelity results, what changed                                                |

**Note on the slash command.** You picked "skill + thin slash command". A separate
`.claude/commands/design-system.md` is not needed: `commands/*.md` is the legacy layout, and
`user-invocable: true` in SKILL.md frontmatter surfaces the skill as `/design-system` directly.
Same outcome, one file instead of two, no duplicated description to drift. If you want the
separate command file anyway, say so and it's a five-line addition.

---

## What exists vs what this adds

Five of the eight jobs have no tooling behind them today. A skill that says "check accessibility"
with nothing to run is prose that will drift; each of these gets a real script first.

| Job               | Today                                                             | Added                                                                                    |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Generate          | ✅ `figma2react gen`                                              | config-driven wrapper, auto `.env` load, offline default                                 |
| Design issues     | ✅ `auditDesign` (`packages/core/src/audit.ts`), printed by `gen` | `--audit-only` + `--json` so review doesn't regenerate                                   |
| **Atomic layers** | ❌ nothing; output is one flat directory                          | layer resolution + 9 checks; `--layout atomic` output tree                               |
| Fidelity          | ✅ `test-storybook` (57 nodes within 4px)                         | nothing new                                                                              |
| Token refresh     | ✅ `figma2react tokens`                                           | diff against the committed `tokens.css`                                                  |
| **Accessibility** | ❌ nothing                                                        | `@storybook/addon-a11y` + axe in play functions; **plus three new audit checks** (below) |
| **E2E**           | ⚠️ CLI-only (`packages/cli/test/e2e.test.ts` vs a fixture server) | Playwright spec against the Vite app; `playwright` is already a dep                      |
| **Coverage**      | ❌ no provider                                                    | `@vitest/coverage-v8` + thresholds                                                       |
| **Security**      | ❌ nothing                                                        | `pnpm audit` + `scripts/scan-secrets.mjs`                                                |

### Accessibility belongs in the audit, not only in the tests

Figma carries no alt text, no labels, no roles, no focus order. So a11y failures on generated
components are overwhelmingly **design issues**, and three of them are computable from the Figma
data _before_ any code is generated — which puts them at the Developer Ready gate rather than at
QA. Add to `packages/core/src/audit.ts`, following the existing `DesignFinding` shape:

| `code`              | severity | fires when                                                                                                     | fix                                                                          |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `low-contrast`      | `high`   | a TEXT node's fill vs its nearest opaque ancestor background is below WCAG AA (4.5:1, or 3:1 at ≥18.66px/bold) | Adjust the colour pair in Figma; name which two Styles                       |
| `unlabelled-input`  | `high`   | a node the semantic mapper will emit as `<input>` has no sibling TEXT layer to become a `<label>`              | Add a visible label layer, or a layer named `aria-label: …`                  |
| `icon-only-no-name` | `medium` | a node mapping to `<button>`/`<a>` whose only child is a vector                                                | Rename the layer to its purpose — the layer name becomes the accessible name |

Contrast maths reuses `lightness()` (CIE L\*) already in `packages/core/src/tokens/collect.ts`;
WCAG needs relative luminance, which is a sibling function on the same sRGB decode, not a new
dependency.

---

## Atomic design layers

The review gains a layering section, following the three-category model in
[Implementation of atomic design](https://seeliang.medium.com/implementation-of-atomic-design-67301cb0e09b):
**Atoms, Molecules, Organisms**, with Theme held separately. Templates and Pages are not layers here.

### Where the classification comes from

The article's central warning is that mis-sorting is expensive — "we ended up having massive
refactoring", and the retrospective conclusion was that designers and developers must sort
components **before** development. So the tool must not guess the layer. It reads a declared one,
in this order:

1. **Figma section or page name** — `Atoms` / `Molecules` / `Organisms`. This is the right home:
   the decision is made in the file, by the two people the article says must make it together.
2. **Layer-name prefix** — `atom/Button`, `molecule/Search Bar`. Figma's existing slash convention.
3. **`design-system.json` override**, for components the file cannot be restructured to express.
4. **Nothing** → a `high` finding, carrying the CLI's suggested layer and the evidence for it
   (see `init` below). Unclassified is a state to fix, and the tool hands you the likely answer
   rather than making you sort from a blank sheet — but it never records it for you.

**This will fire on every component on day one.** The file is a single `📐 Design System` section
with no atomic grouping, so the first `/ds-design-review` run reports every component as
unclassified, and the fix is a Figma restructure — three sections, or `atom/` `molecule/`
`organism/` prefixes. That is the correct first output, not a bug in the review.

### What is then checkable

Once a layer is declared, structure and scope can be checked against it. Added to
`packages/core/src/audit.ts` alongside the a11y checks:

| `code`                       | severity | rule from the article                                                                         | fires when                                                                                  |
| ---------------------------- | -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `layer-unclassified`         | `high`   | sorting is the critical part                                                                  | no section, prefix, or override gives a layer                                               |
| `layer-dependency-violation` | `high`   | "Atoms can NOT include any other components"; molecules include only molecules and atoms      | the import graph points upward — an atom includes anything, a molecule includes an organism |
| `scope-margin-leak`          | `high`   | "padding of components is in the scope, but the margin set shall be controlled by its parent" | a component's own root carries margin or absolute placement                                 |
| `mixed-scope`                | `high`   | the `organism-a__element` inside `molecule-0` mistake                                         | a layer inside component B is named for component A's namespace                             |
| `atom-multi-element`         | `medium` | "one element (HTML tag), no internal functions"                                               | a declared atom emits more than one element                                                 |
| `organism-not-full-width`    | `medium` | "always consumes the full width of the device"                                                | a declared organism neither spans the frame nor is `layoutSizingHorizontal: FILL`           |
| `molecule-full-width`        | `medium` | molecules are "NOT consuming the full width (edge to edge)"                                   | a declared molecule does span edge to edge — likely an organism                             |
| `unowned-component`          | `low`    | Specific / Private / Public ownership                                                         | no ownership declared for the component                                                     |
| `no-breakpoints`             | `low`    | Theme = colours, spacing, **breakpoints**                                                     | the theme has colours and spacing but no breakpoint set                                     |

Two of these fall out of work already done rather than needing new machinery:

- **`scope-margin-leak`** is the `placementClasses` wrapper in `packages/emit-react/src/emit.ts`
  restated as a rule. That wrapper exists precisely so a component's placement lives on something
  the _parent_ renders; anything that leaks inside the component root is the margin-vs-padding
  violation the article describes.
- **`layer-dependency-violation`** needs no new analysis — `ComponentEntry` plus the nested-instance
  tracking in `emit.ts` already give the full import graph.

### Output follows the packaging structure

`--layout atomic` (set in `design-system.json`; default stays `flat`, so nothing breaks silently)
emits the article's package-friendly tree instead of one directory:

```
examples/src/design-system/
  atoms/button/{index.tsx, index.stories.tsx}
  molecules/form-field/{index.tsx, index.stories.tsx}
  organisms/…
  theme/{tokens.css, fonts.css}
```

One directory per component, so `atoms/` can later ship as the base package and each molecule as
its own with atoms as a peer dependency — the scaling path the article lays out. Per-component
`index.css` is not emitted: styling is Tailwind utilities plus the theme, so there is nothing to
put in it.

This is the largest change in the plan. It moves every generated file, so `examples/src/styles.css`,
the `@source` globs, `scripts/verify-styles.mjs` and the Storybook stories glob all follow. Doing it
behind a flag keeps the current output as the fallback if the migration turns out to be noisy.

### Ownership

Specific / Private / Public is a team fact, not a Figma fact, so it is declared in
`design-system.json` per component (or per section, inherited). `ds-design-review` reports the
split and flags unowned components. The value is the article's: it tells a reader whether a
component is theirs to change, and whether it belongs in the shared package at all.

---

## Getting started: `init`, and suggested layers

Nothing above works until someone says **which part of the Figma file to generate from**. Today
that is a URL typed from memory. `init` makes it the first thing the tool asks for.

### `figma2react init`

```
figma2react init [--from <figma-url>] [--yes]
```

1. **Asks for the generate area** — a Figma URL, file key, or `<key>:<node>`. This is the scope
   everything else inherits: the root frame the components are read from. Pre-filled from an
   existing `design-system.json` when one is present.
2. Probes that node and lists the components it found.
3. **Suggests a layer for each one, with the evidence**, and asks for confirmation.
4. Asks for the default ownership (public / private / specific).
5. Writes `design-system.json`.

`--yes` accepts every suggestion without prompting, for scripted and CI use. It is the only way a
layer gets recorded without a human looking at it, and it has to be typed.

`pnpm ds:init` wraps it. The `design-system` skill runs the same flow conversationally via
`AskUserQuestion`, so the answers are the same either way.

### The CLI suggests the layer — it does not decide it

Earlier this plan said the tool must never infer a layer. That stands for _recording_ one, but
being silent is unhelpful: nobody wants to sort thirty components from a blank sheet. So the CLI
proposes, and a person confirms. This is the article's "developers and designers shall work
closely and shall figure out how components should be used" with the tool doing the legwork.

Signals, all already in the IR:

| Signal                    | Source                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------- |
| element count             | number of HTML elements the emitter produces                                          |
| includes other components | the `ComponentEntry` import graph                                                     |
| width vs the frame        | `absoluteBoundingBox.width` against the root frame, or `layoutSizingHorizontal: FILL` |
| has behaviour             | `COMPONENT_SET` with state variants                                                   |

Suggestion rules, straight off the article's checklist:

- one element, includes nothing, not full width → **atom**
- more than one element, not edge to edge → **molecule**
- spans the frame edge to edge, or is a direct child of the page at `FILL` width → **organism**
- **conflicting signals → no suggestion.** A one-element full-width divider is an atom by
  structure and an organism by width; the tool prints both readings and asks. Guessing here is
  exactly the mis-sort that costs the refactor.

Every suggestion prints its reasoning, so it can be argued with:

```
Button Primary      atom       1 element, no nested components, 120×40 in a 1440px frame
Form Field          molecule   4 elements, includes InputFieldDefault, 360px of 1440px
Page Header         organism   spans the frame edge to edge, direct child of the root
Divider             ?          1 element (atom) but spans the frame (organism) — which is it?
```

`ds-design-review` prints the same block against `layer-unclassified` findings, so the review
tells you what to sort things as, not merely that they are unsorted.

---

## Version record

`docs/design-system-versions.md`, appended by `ds:gen` on every successful non-dry run. The
question it answers is the one the Release Ready gate actually asks: _which version of the Figma
file is this build made from, and what moved since the last one?_

```markdown
## 0.4.0 — 2026-09-03

|                |                                                 |
| -------------- | ----------------------------------------------- |
| Figma file     | design-system-sample `uA3bE5ofr6BgRakJzudL4L`   |
| Figma modified | 2026-09-01T04:12:33Z                            |
| Node           | 2-77                                            |
| Generated      | 9 components — 4 atoms, 4 molecules, 1 organism |
| Audit          | 0 high · 2 medium · 1 low                       |
| Fidelity       | 57/57 within 4px, worst 2.3px                   |

**Changed** — `input-field-error` border `#dc2626` → `#b91c1c`; new `ButtonDanger` (atom).
```

- **`Figma modified`** comes from `lastModified`, already on the file-nodes response and already
  read in `pipeline.ts`. It is what ties a build to a design state; a commit date does not.
- **The version** is semver held in `design-system.json` and bumped by the run. The bump is
  computed by diffing the component manifest against the previous record: patch for token and
  style changes only, minor for an added component, major for a removed or renamed export.
  Like the layer, the CLI **suggests** the bump and `--yes` accepts it — a rename that is really a
  fix should not silently ship as a major.
- **Changed** is the manifest and token diff, which `ds:tokens --diff` already computes.

The file is append-only and committed. It is the artefact a QA or release conversation points at,
and it is what makes "which design version is in production" answerable without opening Figma.

---

## Files

```
design-system.json                      new — the single source of design-system context
scripts/
  ds.mjs                                new — resolves config → figma2react; loads .env; --offline
  scan-secrets.mjs                      new — greps tracked files for figd_/ghp_/sk-/AWS keys
  verify-styles.mjs                     unchanged
packages/core/src/audit.ts              + 3 a11y checks and 9 atomic-layer checks
packages/core/src/contrast.ts           new — relative luminance + WCAG ratio
packages/core/src/atomic.ts             new — layer resolution (section → prefix → override),
                                              layer SUGGESTION from structure + width + graph,
                                              structure + scope + dependency-graph rules
packages/emit-react/src/emit.ts         + layer on ComponentEntry; atomic output paths
packages/cli/src/index.ts               + `audit` and `init` subcommands; gen gains
                                          `--layout atomic` and `--record`
packages/core/test/fixtures/
  design-system.json                    new — the recorded real-file response, committed
examples/.storybook/main.ts             + '@storybook/addon-a11y'
examples/e2e/gallery.spec.ts            new — Playwright spec
examples/playwright.config.ts           new
vitest.config.ts                        + coverage provider and thresholds
package.json                            + ds:gen ds:tokens ds:audit a11y e2e coverage security
docs/design-system-skills-plan.md       new — this plan, committed so the repo carries its rationale
docs/design-system-versions.md           new — append-only version record, one entry per generation
docs/delivery-gates.md                  new — the user doc: stage → command, and how to load them
.github/workflows/design-system.yml     new — runs the gate scripts offline, no Figma token
README.md                               + a Skills section linking to docs/delivery-gates.md

.claude/skills/
  design-system/
    SKILL.md                            router; user-invocable: true → /design-system
    references/
      cli.md                            every command, flag, and what it writes
      atomic.md                         the three-layer model, scope rule, dependency direction
      gates.md                          one-line link to docs/delivery-gates.md
  ds-generate/SKILL.md                  cross-cutting
  ds-design-review/SKILL.md
  ds-fidelity/SKILL.md
  ds-a11y/SKILL.md
  ds-test/SKILL.md
  ds-security/SKILL.md
  ds-theme/SKILL.md                     one per layer
  ds-atoms/SKILL.md
  ds-molecules/SKILL.md
  ds-organisms/SKILL.md
```

### `design-system.json`

```json
{
  "version": "0.4.0",
  "file": { "key": "uA3bE5ofr6BgRakJzudL4L", "node": "2-77", "name": "design-system-sample" },
  "out": "examples/src/design-system",
  "gen": {
    "traceIds": true,
    "stories": true,
    "fidelityThreshold": 4,
    "minUses": 3,
    "layout": "flat"
  },
  "atomic": {
    "layers": { "ButtonPrimary": "atom", "InputFieldDefault": "atom", "FormField": "molecule" },
    "ownership": { "default": "public", "FormField": "private" }
  },
  "offline": { "fixture": "packages/core/test/fixtures/design-system.json" },
  "conventions": {
    "colours": "Bind as Figma Colour Styles. Variable names need Enterprise; Style names ship on every plan.",
    "fontSizes": "Bind as Variables to get --text-* entries.",
    "layering": "Declare the layer in Figma with Atoms/Molecules/Organisms sections. This block is the fallback."
  }
}
```

### `scripts/ds.mjs`

The reusable primitive both humans and skills call. Subcommands `init | gen | tokens | audit |
diff-tokens`, each resolving `design-system.json` into a `figma2react` invocation.

`gen` takes `--layer atoms|molecules|organisms|theme` to regenerate one layer in place, leaving
the others untouched. That is what the four layer skills call, and it is what makes a one-atom
change reviewable as a small diff instead of a whole-tree rewrite.

Three things it fixes that are currently manual:

- **Loads `.env`.** Nothing in the codebase reads it today (no `dotenv` dependency) — `node
--env-file=.env` when the file exists.
- **`--offline` points `FIGMA_API_BASE` at a local fixture server**, the mechanism
  `packages/cli/test/e2e.test.ts:53` already uses. **Offline is the default** for `audit` and
  `diff-tokens`; `--live` opts in to spending quota.
- **Passes the real file key even offline**, so Storybook design-panel URLs stay valid. Getting
  this wrong is what produced the "file may not be publicly accessible" error before.

### `packages/cli/src/index.ts` — `audit` subcommand

`auditDesign` is already computed in `pipeline.ts:90` but only reachable by running `gen`.
A review shouldn't have to rewrite the output directory. Add:

```
figma2react audit <figma-url> [--json]
```

Reusing `reportDesign` (`index.ts:204-216`) for the human format; `--json` emits the
`DesignFinding[]` for the skill to reason over.

---

## The skills

Each SKILL.md follows the on-disk convention: two-key frontmatter (`name`, `description`) plus
`allowed-tools`, then H1 → "When to use" → numbered steps → "Reporting". Bodies stay short
(~60-120 lines) and reference `references/*.md` by relative link rather than inlining.

### Cross-cutting

| Skill              | Runs                                                  | Reports                                                                                                                                                        |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `design-system`    | nothing directly                                      | routes; `AskUserQuestion` when the job is ambiguous                                                                                                            |
| `ds-generate`      | `pnpm ds:init` then `pnpm ds:gen`                     | on a fresh repo, asks for the generate area and confirms each suggested layer; then files written, version bump, warnings, and hands off to `ds-design-review` |
| `ds-design-review` | `pnpm ds:audit --json`                                | a layer table (atom/molecule/organism, ownership, unclassified) then findings as **Figma actions**, never code changes                                         |
| `ds-fidelity`      | `pnpm --filter figma-to-react-example test-storybook` | per-node px deltas, worst first                                                                                                                                |
| `ds-a11y`          | `pnpm a11y`                                           | axe violations split into _fixable in code_ vs _design issue_                                                                                                  |
| `ds-test`          | `pnpm test`, `pnpm e2e`, `pnpm coverage`              | failures with output; uncovered files against the threshold                                                                                                    |
| `ds-security`      | `pnpm security`                                       | advisories by severity; secret hits with the file, never the value                                                                                             |

### One per layer

The layers are where the day-to-day work happens, and each has different rules, so each gets its
own skill rather than a flag on a general one. All four share a shape: **list what is in the
layer → regenerate just that layer → check the layer's own rules → report violations as Figma
actions.** Scoping generation to one layer is what makes an edit reviewable; regenerating
everything to change one atom buries the change.

| Skill          | Scope                                    | The rules it enforces                                                                                                                                    |
| -------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ds-theme`     | `theme/` — colours, spacing, breakpoints | every colour bound to a Style or Variable; font sizes bound; **a breakpoint set exists**; no synthesised names left where a real one is available        |
| `ds-atoms`     | `atoms/`                                 | one element; no nested components; no internal functions; used only by molecules and organisms — an atom nobody consumes is dead weight and gets flagged |
| `ds-molecules` | `molecules/`                             | more than one element; **not** edge to edge; includes only molecules and atoms; padding inside scope, margin left to the parent                          |
| `ds-organisms` | `organisms/`                             | spans the full width; sits at root level as a direct child of the page; may include anything below it                                                    |

`ds-theme` replaces the earlier `ds-tokens` — the Theme _is_ the token layer in this model, and
two skills for one thing is how they drift apart. It is the one to run first: colours and spacing
are what every other layer resolves against, so an unbound colour shows up as noise in all three
component skills until the theme is fixed.

`ds-organisms` is included for completeness of the model. **It will find nothing today** — the
sample file is buttons, inputs and a form field, all atoms and molecules, with no full-width
component. That is a fact about the file, not a gap in the skill.

Each layer skill can also answer "what belongs here?" — given a component, it says whether it
meets that layer's checklist and, when it does not, which layer it does meet. That is the sorting
conversation the article says to have, available per component instead of only at `init`.

---

## `docs/delivery-gates.md` — the user doc

A committed, human-facing doc (not skill prose) answering two questions: _which command do I run
at which stage_, and _how do I get the commands_. `references/gates.md` in the router skill is a
one-line link to it, so there is one copy.

### Section 1 — Loading the commands

Skills in `.claude/skills/` are discovered automatically when Claude Code runs with this repo as
the working directory. No install step, no settings edit. The doc states:

- Type `/` to list them; `/design-system` is the entry point, the ten `ds-*` skills are
  directly invocable, and Claude will reach for the right one unprompted when the request matches.
- Skills added while a session is open need `/reload` (or a new session) to appear.
- A per-user opt-out exists via `skillOverrides` in `~/.claude/settings.json`, worth naming so
  nobody thinks a missing skill is a bug.
- **Every skill has a plain `pnpm` equivalent.** Nobody is required to use Claude Code to pass a
  gate, and CI runs the scripts, not the skills. Both columns appear in the table below.

### Section 2 — Stage → command

| Stage           | Gate it feeds   | Skill                                       | Script                                                   | Automatable                                              |
| --------------- | --------------- | ------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Setup (once)    | —               | `/ds-generate`                              | `pnpm ds:init`                                           | ❌ the generate area and layer sorting are human answers |
| Design in Figma | Developer Ready | `/ds-design-review`                         | `pnpm ds:audit`                                          | ✅ needs a live Figma call                               |
| Refinement      | Developer Ready | `/design-system` (routes)                   | —                                                        | ❌ acceptance criteria are human                         |
| Build           | Dev Complete    | `/ds-generate`                              | `pnpm ds:gen`                                            | ✅                                                       |
| Build           | Dev Complete    | `/ds-theme`                                 | `pnpm ds:tokens --diff`                                  | ✅                                                       |
| Build           | Dev Complete    | `/ds-atoms` `/ds-molecules` `/ds-organisms` | `pnpm ds:gen --layer <name>`                             | ✅                                                       |
| Code review     | Dev Complete    | `/ds-test`                                  | `pnpm test && pnpm coverage`                             | ✅                                                       |
| QA              | QA Signoff      | `/ds-fidelity`                              | `pnpm --filter figma-to-react-example test-storybook`    | ✅                                                       |
| QA              | QA Signoff      | `/ds-a11y`                                  | `pnpm a11y`                                              | ✅ violations; ❌ triage is human                        |
| QA              | QA Signoff      | `/ds-test`                                  | `pnpm e2e`                                               | ✅                                                       |
| Design QA       | QA Signoff      | —                                           | Storybook design panel, side by side                     | ❌ visual judgement                                      |
| UAT             | Release Ready   | —                                           | —                                                        | ❌                                                       |
| Release prep    | Release Ready   | `/ds-security`                              | `pnpm security`                                          | ✅                                                       |
| Release prep    | Release Ready   | —                                           | `pnpm verify`                                            | ✅                                                       |
| Release prep    | Release Ready   | —                                           | `docs/design-system-versions.md` — read the latest entry | ✅ written by `ds:gen`                                   |

### Section 3 — Gate criteria

What must be true to pass each gate, stated so it can fail:

- **Developer Ready** — zero `high` audit findings; every component sorted into a layer, with
  ownership declared; the `design-system.json` node points at a frame with Auto Layout; every
  variant set has the interaction states it needs. Layer sorting sits at _this_ gate deliberately:
  the article's whole point is that sorting after development is what causes the refactor.
- **Dev Complete** — `pnpm verify` green; `git diff --exit-code examples/src/design-system` clean,
  which is the real assertion that committed code matches the current Figma file.
- **QA Signoff** — fidelity within the configured threshold (4px today, 57/57 passing); axe
  violations either fixed in code or filed as Figma actions, none unresolved; e2e green.
- **Release Ready** — no high/critical advisories; no secret-scan hits; coverage at or above
  threshold; token diff empty; a version-record entry exists for this build, naming the Figma
  file version it was generated from.

### Section 4 — Best-case automated flow

```
Figma file changes
   │
   ├─ pnpm ds:audit --live --json
   │     ├─ high findings ──▶ file the Figma actions, assign the designer.  STOP.
   │     └─ clean
   │
   ├─ pnpm ds:gen --live  ──▶ branch + PR
   │
   └─ CI (.github/workflows/design-system.yml)
         pnpm verify                    build · typecheck · unit · styles · fidelity
         pnpm a11y · e2e · coverage · security
         │
         ├─ generated diff empty ──▶ "no visual change"
         └─ diff non-empty       ──▶ PR comment: px deltas, axe violations, token diff
```

**The honest constraint:** the first arrow cannot be a Figma webhook on this plan. Webhooks
require an Org/Enterprise plan; on Starter the options are a manual trigger or a scheduled poll,
and polling spends the same quota that is already the binding limit. So the doc documents the
manual trigger as the real flow and the webhook as what an org plan would unlock — a plan
limitation, not a tooling one.

Everything after `ds:gen` runs offline against the committed fixture, so CI needs no Figma token
and no quota. Only the two `--live` steps do.

---

**The one rule every skill inherits** (from `.claude/skills/design-system/SKILL.md`, and
already saved as a standing preference): when the output is limited by what the Figma file
lacks, say so and name the Figma action. Do not invent a hover colour nobody designed, do not
hand-patch a label the design should carry, and do not frame a design gap as a tool limitation.

`ds-a11y` is where this bites hardest — the temptation is to add `aria-label="Button"` to
silence axe. The skill must instead report it as `icon-only-no-name` with the layer to rename.

---

## Two things worth flagging

**The Figma token in `.env` should be rotated.** `figd_LVdz…` was pasted into a chat transcript.
`.env` is gitignored (`.gitignore:4`) so it was never committed, but the value is exposed.
`scripts/scan-secrets.mjs` will flag it on every run until it is replaced — which is the correct
behaviour, and a good first test of `ds-security`.

**The offline fixture is currently ephemeral.** The recorded real-file response lives in a
scratch directory that will not survive. Committing it to
`packages/core/test/fixtures/design-system.json` is what makes every skill runnable without
touching the Starter-tier quota — do this first in Phase 1, before anything depends on it.

---

## Three phases

Each phase ends with something usable on its own. If the work stops after any of them, what
exists still works — nothing is left half-wired.

### Phase 1 — Runnable ✅ built

**Delivered:** `design-system.json`, `scripts/ds.mjs`, `figma2react init` and `figma2react audit`,
`packages/core/src/atomic.ts` with layer resolution and suggestions, nine layering checks in the
audit, 24 new tests, and the `design-system` / `ds-generate` / `ds-design-review` skills.
`pnpm verify` green: 165 unit tests, 111 generated classes resolve, 11/11 stories within 4px.

**Where it diverged from this plan, and why:**

- **`scope-margin-leak` shipped as `scope-size-override`.** Figma has no margin, and the REST
  response carries no override list, so the padding-versus-margin rule is not directly observable.
  What _is_ observable is an instance resized away from its master — the same violation, the
  parent reaching inside the child — so the check is named for what it detects rather than for the
  rule it stands in for.
- **The recorded fixture had to be re-recorded.** It was gone, exactly as this plan predicted, and
  is now committed at `packages/core/test/fixtures/design-system.json` (386KB, 111 nodes).
- **`gen` defaults to live, not offline.** Generating from a stale recording produces code that
  does not match the file. `audit` and `diff-tokens` default to offline as planned.
- **The Figma file has changed.** It now has Hover variants for Button and Input Field, so
  `no-interactive-states` no longer fires and four new components are generated. The design issue
  the audit raised was acted on.
- **New known gap: `gen` never deletes.** The variant rename left three orphaned files that still
  compiled and were still imported by the hand-maintained gallery. Worth a `--prune` flag.
- **`examples/public/figma-geometry.json` is stale** — it predates the hover variants and is not
  written by `gen`. Only `fidelity.html` reads it; the Storybook fidelity tests use the copy in
  `examples/src/design-system/`.

_Make the CLI drivable by intent, and get the components sorted._

1. Commit the offline fixture to `packages/core/test/fixtures/design-system.json`. Everything
   downstream depends on being able to run without spending the Starter-tier quota, so this is
   first.
2. `scripts/ds.mjs` — `init`, `gen`, `tokens`, `audit`, `diff-tokens`. Loads `.env`, defaults to
   offline, passes the real file key even offline so design-panel URLs stay valid.
3. `figma2react audit` subcommand with `--json`, reusing `reportDesign` for the human format.
4. `packages/core/src/atomic.ts` — layer resolution (section → prefix → override → unclassified),
   the layer-**suggestion** rules with their evidence, and the nine layering checks. Fixture tests
   for each, including the article's own mixed-scope shape.
5. `figma2react init` — prompts for the generate area, confirms each suggested layer, writes
   `design-system.json`. The config is written by this command, not hand-authored.
6. `.claude/skills/design-system/` — router plus `references/{cli,atomic,gates}.md` — and the
   `ds-generate` and `ds-design-review` skills.

**Done when:** `/design-system` answers "is this Developer Ready?" by running the audit offline and
reporting Figma actions with a suggested layer for every unsorted component.

**Phase 1 output is a list of things to fix in Figma.** Expect it to be long — every component is
currently unclassified, and colours are unbound. That output is the point of the phase.

### Phase 2 — Layered

_Put the atomic structure into the code, and record what was generated._

7. `--layout atomic` in the emitter, then migrate `examples/src/design-system/` to
   `atoms/ molecules/ organisms/ theme/`. Follow through to `styles.css`, the `@source` globs,
   `scripts/verify-styles.mjs` and the Storybook stories glob — all four break silently if missed.
8. Ownership (Specific / Private / Public) in `design-system.json`, reported by the review.
9. The four layer skills: `ds-theme`, `ds-atoms`, `ds-molecules`, `ds-organisms`.
10. `--record` and `docs/design-system-versions.md`, with the suggested semver bump from the
    manifest diff. Backfill one entry for the current output so the file is not born empty.

**Done when:** each layer can be regenerated and reviewed on its own, and every generation leaves
a record naming the Figma version it came from.

**The riskiest step in the plan is 7.** It moves every generated file. It is behind a flag with
`flat` as the default, so if the migration turns out noisy the fallback is one config line.

### Phase 3 — Gated

_Give every delivery gate a command, and let CI run them._

11. `packages/core/src/contrast.ts` + the three a11y audit checks, with fixture tests.
12. Missing tooling: `@storybook/addon-a11y`, `@vitest/coverage-v8`,
    `examples/e2e/gallery.spec.ts`, `scripts/scan-secrets.mjs`, and the npm scripts exposing them.
13. The `ds-a11y`, `ds-test`, `ds-security` and `ds-fidelity` skills.
14. `docs/delivery-gates.md` — written last, so the stage→command table cites commands that
    provably exist and have been run. README gains a Skills section linking to it.
15. `.github/workflows/design-system.yml` — the offline half of the flow, on every PR. Needs no
    Figma token and no quota, because everything after `ds:gen` runs against the committed fixture.

**Done when:** `pnpm verify` covers a11y, e2e, coverage and security, and a PR comment carries the
px deltas, axe violations and token diff.

---

## Verification

1. **Offline end-to-end.** `pnpm ds:gen` with no network reachable produces byte-identical output
   to what is committed in `examples/src/design-system/`. `git diff --exit-code` on that directory
   is the assertion.
2. **Audit checks.** Unit tests in `packages/core/test/audit.test.ts` for each new code, using a
   fixture with a known-failing contrast pair, an unlabelled input, an atom that includes another
   component, and the article's own `organism-a__element`-inside-`molecule-0` shape. Existing six
   checks must not change — the current findings on the real file are the regression baseline.
   Layer resolution gets its own table test: section name, then prefix, then override, then
   unclassified — in that precedence order.
3. **`pnpm verify` stays green** and grows `coverage`, `a11y`, `e2e`, `security`.
4. **Skills load.** `/design-system` appears in the slash list; each `ds-*` skill is invocable by
   name; the router's `AskUserQuestion` branch fires when the request is ambiguous.
5. **Skills actually work.** Drive each one for real: ask "is the design system Developer Ready?"
   and confirm `ds-design-review` runs the audit and reports Figma actions; ask "regenerate the
   buttons" and confirm `ds-generate` runs offline without being told to.
6. **The design-issue rule holds.** Introduce a contrast failure in the fixture and confirm
   `ds-a11y` reports it as a Figma colour change, not as a Tailwind class edit. This is the
   behaviour most likely to regress and the least likely to be caught by a test.
7. **Atomic output holds together.** With `--layout atomic`, `pnpm verify` stays green end to end —
   which proves Tailwind still scans the moved files, stories still resolve, and fidelity is
   unchanged by the reorganisation. `git diff` on the rendered DOM should be empty: this is a file
   move, not a visual change.
8. **`init` on a clean checkout.** Delete `design-system.json`, run `pnpm ds:init`, and confirm
   it asks for the generate area, suggests a layer for all nine components with visible evidence,
   refuses to guess on any conflicting case, and reproduces the committed config. Then confirm
   `--yes` does the same non-interactively.
9. **The version record is honest.** Change one colour in the fixture, regenerate, and confirm the
   new entry names the changed token, suggests a patch bump, and carries the Figma `lastModified`
   from the response rather than the wall clock.
10. **The doc is true.** Run every `pnpm` command in the `docs/delivery-gates.md` table, in order,
    from a clean checkout. Any that does not exist or does not pass is a bug in the doc, not a
    caveat to add to it.

## Out of scope

Packaging as an installable plugin for other repos (`.claude-plugin/plugin.json`) — the config
format is portable, so this stays possible later · Code Connect generation · hover/pressed
variant mapping · collapsing variants into a prop union · anything downstream of merge (deploy,
hosted Storybook, release automation) · Figma webhooks, which the plan tier does not offer ·
actually splitting `atoms/` and each molecule into published npm packages — the plan produces the
folder structure that makes that possible, and stops there · Templates and Pages as layers.
