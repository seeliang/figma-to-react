# Phase 2a — the theme track

Slots into `docs/design-system-skills-plan.md`, which holds the full three-phase plan. Phase 1 is
built and committed. This is the theme slice of Phase 2, pulled forward because it is what the
next piece of work needs.

## Context

The theme — colours, spacing, breakpoints — currently has one command behind it (`pnpm ds:tokens`)
and no lifecycle. There is no way to see every token, no test that a token reached the bundle, no
version, and no record of what changed between two generations.

The ask is to give the theme a **stage-by-stage developer flow**: what you run at each point in
delivery, from "is the design ready to generate from" through to "this version is signed off".
Then rewrite `docs/theme-guide.html` as that flow rather than as the conceptual guide it is now.

### Decisions taken

| | |
|---|---|
| Stage 0 | **Bind Colour Styles first.** Generating, testing and versioning synthesised names locks in names that all change the moment a Style is bound |
| QA | **Three checks, each where it is cheapest** — see the table below. Contrast ratios stay in Phase 3 with the rest of a11y |
| Versioning | **Out of scope — NX and CI own it.** No semver, no changelog, no `--release` in this repo |
| The test | **Generated, not hand-written.** `gen` writes the story *and* its assertions, so N colours in the design means N asserted in the test |
| Naming | **This is a hand-tailored design system.** Tailwind's palette names are not the target and are not an oracle — see the correction below |

## A correction, and why it matters

While planning I built a check that compared each generated token name against Tailwind's own
palette, and it "failed" on four of six colours — `#e2e8f0` named `blue-200` where Tailwind calls
it `slate-200`, `#64748b` named `slate-600` where Tailwind calls it `slate-500`.

**That check is measuring the wrong thing and is not in this plan.** The design system here is
hand-tailored; agreeing with Tailwind's ramp is not a goal, and a test that enforced it would
generate churn in service of somebody else's vocabulary.

What the disagreement actually shows is narrower and still worth saying: the synthesised names are
a **fallback**, and a fallback is all they can be. `--color-slate-600` describes a colour; it does
not say what the colour is *for*. The fix is not a better ramp, it is stage 0 — bind a Colour
Style and the derived name is never used again.

This goes into the project skill so no future session reaches for Tailwind-correctness as the
standard.

---

## The stages

| # | Stage | Gate | Command | What has to be true |
|---|---|---|---|---|
| 0 | Design Ready | Developer Ready | `pnpm ds:theme --audit` | colours bound to Styles; the names come from the design system's own vocabulary |
| 1 | Generate | — | `pnpm ds:theme` | `tokens.css`, `fonts.css`, `tokens.json`, `theme.stories.tsx` written |
| 2 | Test | Dev Complete | `pnpm --filter figma-to-react-example test-storybook` | every token has a swatch, and every swatch renders its declared value |
| 3 | Review | Dev Complete | `pnpm ds:theme --diff` | what changed since the last generation, as a diff a reviewer can read |
| 4 | QA signoff | QA Signoff | `pnpm verify` | all three checks green |
| — | Release | Release Ready | *(NX + CI)* | versioning and publishing live outside this repo |

`ds:theme` is one command with modes rather than five commands, because the stages share the same
config resolution and the same offline/live decision.

---

## The three QA checks

"Verify the numbers are right and the values are right" resolves into three different questions
that want three different homes. Putting them all in the browser would be slow and would hide two
of them behind Playwright.

| Check | Question | Where | Why there |
|---|---|---|---|
| **Rendered vs declared** | does the swatch actually paint `#2563eb`? | Storybook play function | needs `getComputedStyle` in a real browser; jsdom will not resolve `var()` |
| **Committed vs Figma** | does `tokens.json` still match the design file? | `scripts/verify-tokens.mjs` | needs the recorded fixture, not a browser — node, fast, runs in CI without Playwright |
| **Stable and unique** | does the same hex always yield the same name, and do two colours never collide? | `packages/core/test/tokens.test.ts` | a pure function; no I/O at all |

The third replaces the Tailwind oracle. It asserts what the generator actually promises —
determinism and no collisions — rather than agreement with a palette this project does not use.

**Normalisation matters in the first check.** `getComputedStyle` returns `rgb(37, 99, 235)`, never
`#2563eb`, and `emit.ts:177` converts lengths px → rem on the way out, so `--spacing-4` is declared
as `1rem` and computed as `16px`. Colours are the clean case; the helper normalises both sides and
skips kinds it cannot compare, saying which it skipped rather than passing silently.

---

## What gets built

### 1. `tokens.json` — the manifest (the blocking seam)

Nothing writes the token table to disk today; `collectTokens` returns it, `emitThemeCss` consumes
it, and it is discarded. A swatch story would have to re-parse CSS, which is unreliable for the
reason in §5 below.

New output of `gen`, alongside `figma-geometry.json`, imported by the story the same way
`examples/src/fidelity/assert.ts:1` imports geometry:

```json
{
  "theme": { "version": "0.2.0" },
  "figma": { "key": "uA3bE5…", "node": "2:77", "lastModified": "2026-08-25T05:22:35Z" },
  "tokens": [
    {
      "kind": "color", "name": "blue-600", "cssVar": "--color-blue-600",
      "value": "#2563eb", "uses": 12,
      "named": false,
      "sources": [{ "source": "style", "key": "S:abc…", "name": "Primary" }]
    }
  ]
}
```

`named` is the stage-0 signal, derived from whether any `TokenRef` carries a `name`
(`packages/core/src/ir/types.ts:23-27` — the Figma Style name does survive on `token.sources[].name`,
even though the layer name does not).

### 2. `packages/emit-storybook/src/theme.ts`

`emitStories` cannot express this: it is typed against `ComponentEntry[]` and imports
`./${entry.file}`, and a token gallery has no backing component file. A sibling emitter, not a
`ComponentEntry` fake.

`emitThemeStories(table, options)` → `theme.stories.tsx`, one story per token kind, each swatch
carrying what the assertion needs:

```tsx
<div data-token="--color-blue-600" data-token-value="#2563eb" data-token-named="false"
     style={{ background: 'var(--color-blue-600)' }} />
```

`parameters: { layout: 'fullscreen' }` locally — the global `preview.ts` sets `centered`, which is
wrong for a grid. Unnamed tokens get a visible marker in the story itself, so the stage-0 gap is
apparent in Storybook and not only in the audit.

### 3. `examples/src/theme/assert.ts`

`expectTokensRendered(container)`, following the conventions in `examples/src/fidelity/assert.ts`:
plain `throw new Error` with a built-up detail string, no `expect` import, so the same helper runs
in the Storybook UI as well as under Vitest.

One deliberate difference from `measure()` (`assert.ts:40-46`), which returns `[]` and passes
silently when a node has no geometry entry: a token in the manifest with **no swatch in the DOM is
a failure**, not a skip. A check that can pass vacuously is worse than no check.

### 4. `scripts/verify-tokens.mjs`

Re-collects the token table from the recorded fixture and diffs it against the committed
`tokens.json`. Fails with the specific token and both values. Joins `pnpm verify` next to
`verify-styles.mjs`.

### 5. Detect the double-declaration collision — corrected

I planned this as "fix it, the checks cannot pass otherwise". Checking the built bundle shows that
is wrong: only one declaration survives (`--color-blue-600:#2563eb`), because Tailwind merges the
`@theme` blocks and the later import wins. The rendered-vs-declared check passes as-is.

The collision is still real, just quieter than I said. `examples/src/generated/tokens.css` — the
card fixture, a *different* design file — declares the same custom property at `#2663eb`, and the
card silently renders the design system's blue instead of its own. Two design files sharing one
global namespace, resolved by import order.

Fixing it properly means namespacing a whole theme, which has to flow through to class names in
the React emitter, so it is out of scope here. What is in scope: `verify-tokens.mjs` **reports**
it, naming both files and both values. This project's recurring failure mode is exactly this
shape — something silently overridden, build still green — so turning it into a printed finding is
worth more than leaving it to be rediscovered.

### 6. The test is generated, and asserts the count

The point of generating the test alongside the story is that the design decides how many
assertions there are. Ten colours in the file means ten swatches and ten checked values; add an
eleventh in Figma and the regenerated test covers it without anyone remembering to.

So `theme.stories.tsx` carries the expected count inline, from the manifest:

```tsx
play: async ({ canvasElement }) => {
  await expectTokensRendered(canvasElement, { color: 7, fontFamily: 1 })
},
```

That number is the alignment assertion. If the manifest says seven colours and the DOM renders
six, the check fails on the count before it ever compares a value — which is the failure mode a
per-swatch loop would otherwise skip silently.

### 7. `ds-theme` skill, and a project note on naming

`.claude/skills/ds-theme/SKILL.md` — routed by stage, not by verb: the skill's first job is to work
out which stage the request is at and run that one command. It does not version anything; when
asked about releases it says NX and CI own that.

`.claude/skills/design-system/references/theme.md` — new, and the place the correction above lives:
this design system is hand-tailored; synthesised names are a fallback that describes a colour
rather than naming its role; the fix for a bad synthesised name is a Colour Style, not a better
ramp; Tailwind's palette is not an oracle.

### 8. `docs/theme-guide.html` — rewritten as the flow

Same visual identity, restructured: the six stages as the spine, each with its command, its gate,
and what fails if you skip it. The derivation table stays but is reframed — it shows what happens
when *no* Style is bound, as the argument for stage 0, not as the main event.

---

## Files

| Path | Change |
|---|---|
| `packages/core/src/tokens/manifest.ts` | new — `TokenTable` → the `tokens.json` shape |
| `packages/emit-storybook/src/theme.ts` | new — `emitThemeStories` |
| `packages/cli/src/pipeline.ts` | return the table; write `tokens.json` and the theme story |
| `packages/cli/src/index.ts` | `theme` subcommand: `--audit`, `--diff`, `--release` |
| `scripts/ds.mjs` | `theme` command, offline-aware like the rest |
| `scripts/verify-tokens.mjs` | new — committed vs Figma |
| `examples/src/theme/assert.ts` | new — rendered vs declared |
| `examples/src/styles.css` | resolve the `--color-blue-600` collision |
| `packages/core/test/tokens.test.ts` | stability and uniqueness |
| `docs/theme-guide.html` | rewritten as the stage flow, then republished to the same artifact URL |
| `.claude/skills/ds-theme/SKILL.md` | new |
| `.claude/skills/design-system/references/theme.md` | new — the hand-tailored naming note |

Also: save the hand-tailored naming decision to memory, so it survives past this session.

## Build order

1. `tokens.json` manifest + pipeline wiring. Everything else reads it.
2. Fix the `--color-blue-600` collision. Do it before writing any check that would trip on it.
3. `emitThemeStories` + snapshot tests, matching `packages/emit-storybook/test/stories.test.ts`.
4. The three checks, in their three homes.
5. `theme` subcommand with `--audit` and `--diff`.
6. `ds-theme` skill and `references/theme.md`.
7. Rewrite and republish the HTML — last, so every command it names has been run.

## Verification

1. **`pnpm verify` green**, now including `verify-tokens.mjs` and the theme story's play function.
2. **The rendered check actually fails when it should.** Change one hex in `tokens.css` by hand and
   confirm the play function names that token and both values. A check nobody has seen fail is not
   yet a check.
3. **No vacuous pass.** Delete a swatch from the story and confirm the helper fails rather than
   skipping — the failure mode `measure()` has and this must not.
4. **The Figma check catches drift.** Edit `tokens.json` and confirm `verify-tokens.mjs` reports
   the specific token with both values.
5. **The count assertion bites.** Add a colour to the manifest by hand without adding a swatch,
   and confirm the play function fails on the count rather than passing over it.
6. **The HTML is true.** Run every command it lists, in order, from a clean checkout.

## Out of scope

Contrast ratios and the rest of a11y (Phase 3) · the atomic output tree and the other three layer
skills (rest of Phase 2) · spacing and radius tokens beyond what already generates · dark-mode or
multi-mode token sets, which the `Token` type has no dimension for · publishing the theme as an
npm package · **versioning of any kind** — no semver, no changelog, no release command; NX and CI
own that and duplicating it here would give two answers to one question.
