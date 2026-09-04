# Follow the design's own names, and show them in Storybook

Follows [Phase 2a](design-system-plugin-plan.md); independent of
[Phase 2b](design-system-packages-plan.md). The designer-facing output of this plan is
`token-naming.md`.

## Context

The design file is right. `Form DS` is a Figma Variable collection with properly-named variables —
`primary`, `border-focus`, `muted-foreground`, `surface`. The generator emits `--color-blue-600`
for `primary` anyway, and the theme story shows only that derived name, so the mismatch is
invisible until someone opens `tokens.json`.

**The generator already maps names when it has them.** `nameFor()` in
`ai-plugin/core/src/tokens/collect.ts` is `c.named ? slugify(c.named.name!) : synthesize(c)`. A
Figma *Colour Style* name comes through on every plan and works today. But this file uses
*Variables*, and `/v1/files/:key/nodes` returns `VariableID:2:38` with no name field. Names sit
behind `GET /v1/files/:key/variables/local` — Enterprise only. The file is correct; the API
withholds the labels.

Three causes were verified against the recorded response. Two are ours, one is not:

| Kind        | In Figma | Bound in the frame | Reaches `tokens.json` | Cause                                   |
| ----------- | -------- | ------------------ | --------------------- | --------------------------------------- |
| **color**   | 10       | 8                  | 7                     | 2 unused here · **8→7 collapse**        |
| **spacing** | 7        | **0**              | 0                     | **not applied to auto-layout** — design |
| **radius**  | 4        | 1                  | **0**                 | **binding shape unread** — tool bug     |

1. **The collapse is caused by the missing names.** `collect.ts` keys a candidate by
   `kind:source:key` when a name exists and by `kind:value` when it does not. With no names,
   `background`, `card` and `primary-foreground` — all `#FFFFFF` — merge into one `--color-white`,
   and `primary` + `border-focus` (both `#2563EB`) merge into `--color-blue-600`. **The committed
   `tokens.json` already records the evidence**: `--color-blue-600` lists sources from two
   different ids, `VariableID:2:38` and `VariableID:2:32`. Three semantic tokens becoming one is
   fatal for dark mode, where they must diverge.
2. **Radius is a real bug.** `ir/style.ts:201-209` reads `topLeftRadius` from `boundVariables`; the
   API sends `rectangleCornerRadii`, an object keyed `RECTANGLE_TOP_LEFT_CORNER_RADIUS`.
   **11 bindings in the fixture, 0 read.**
3. **Spacing is a design issue.** 40 auto-layout frames, 29 with `itemSpacing`, 13 with padding —
   and zero spacing bindings anywhere. The 7 spacing variables exist but are not applied. No code
   recovers a binding never made.

**Intended outcome:** every bound Figma variable produces one CSS custom property carrying that
variable's own name; the theme story shows the design's name beside the CSS variable so the mapping
can be checked by eye; and the generator asks rather than guesses where the design is ambiguous.

### Decisions taken

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| Name source  | **The design first.** Colour Style → palette frame → committed export → derived      |
| Ambiguity    | **Ask once with the evidence, record the answer** — never guess                      |
| Gate         | **Ratchet** — fail when derived tokens *increase*; the budget only comes down        |
| Doc          | **One designer-facing `docs/token-naming.md`**                                       |
| Storybook    | **Show the design's name and the CSS variable together**, per token                  |

---

## 1. The story, first — it is the diagnostic

Build this before anything else. It costs little, and it is what tells us whether the recent Figma
rename came through at all.

`ai-plugin/emit-storybook/src/theme.ts` renders `cssVar`, value, and a "derived" marker. Add the
design side, from `TokenManifestEntry.sources`, which the manifest already carries:

- **the design's own name** per token — the Figma Style or Variable name when known, the variable
  id when not (`VariableID:2:38`)
- **a merge warning when a token has more than one distinct source.** This is the collapse, and it
  is already visible in committed data — no new plumbing needed, just `new Set(sources.map(s => s.key))`
- **fix the "derived — no Style bound" wording.** It is now the wrong diagnosis: these colours *are*
  bound, to Variables whose names the API withholds. Say that instead, since it points at a
  different fix.

```
┌────────────┐
│  swatch    │   --color-primary        ← the CSS variable
└────────────┘   Figma: primary         ← what the design calls it
                 #2563eb
```

Extend `TokenRow` and `ExpectedToken` (`ai-plugin/testing/src/theme/assert.ts`) with the source
list. The play function keeps asserting count-then-value; it should additionally fail when a token
has more than one distinct Figma source, because that is a silent merge.

## 2. Resolve names from the design, in the design's order

`TokenRef` already has an optional `name` (`ir/types.ts:23`) — nothing new to model.

**Resolution order, design first:**

1. **Figma Colour Style name** — works today via `tokenFor()`. Nothing to build.
2. **The `Color Palette` frame.** The file documents its own palette: a `FRAME` per colour holding
   an `ELLIPSE`, a name `TEXT` and a hex `TEXT`. I verified 11 pairs, and the hex label matches the
   actual fill 11 of 11. New reader in `ai-plugin/core/src/tokens/palette.ts`.
3. **The committed export**, joined by variable id — `design-system.json` gains
   `variables: "design-tokens/form-ds.json"`, resolved relative to the config exactly as
   `offline.fixture` is (`ai-plugin/cli/src/offline.ts:fixturePath`). Accept both a flat
   `{"VariableID:2:38": "primary"}` map and `{variables:[{id,name}]}`, since exporters differ.
4. **Derived from the value** — the existing fallback, unchanged.

**The palette frame suggests; it never decides.** Its only join is through the colour value, and
that is ambiguous for **4 of the 8 bound colour variables**: `#2563EB` is rendered by both
`VariableID:2:38` and `2:32`, `#FFFFFF` by both `2:39` and `2:33`. A value join would confidently
name `border-focus` as `Primary` — a wrong name on the public API, silently. The palette also
disagrees with the collection in both directions (it carries `Error`, `Success`, `Muted`; the
collection carries `muted-foreground`, `border-focus`, `card`), which is itself a finding.

This mirrors `assignLayers()` in `ai-plugin/core/src/atomic.ts`, which resolves a *declared* layer
and otherwise **suggests with evidence and refuses to pick**. Reuse that shape rather than
inventing a second one.

### Threading the names

- `StyleContext` (`ir/style.ts`) gains `variables: Record<string, string>`.
- `NormalizeInput` (`ir/normalize.ts:7`) gains `variables?`; `normalize()` builds it into `ctx` as
  it already does `styles`.
- `variableRef()` and `length()` take `ctx` and set `name: ctx.variables[id]`.
- `toLayout(node, parent)` gains `ctx` — the only one of the three `to*` functions without it — and
  passes it to its six `length()` calls.

~16 mechanical call sites in `ai-plugin/core/src/ir/{style,layout,normalize}.ts`.

## 3. Ask once, record the answer

A new `figma2react variables` command, modelled on `init`'s layer flow
(`ai-plugin/cli/src/index.ts:270+`), which already prints a suggestion with its evidence and lets a
person confirm each one:

```
VariableID:2:38   #2563EB   used 7×
  2 variables render this value — the palette cannot tell them apart.
  Color Palette calls it "Primary".
  name? [primary]
```

Resolved ones are shown and skipped; only the ambiguous and unknown are asked. Answers are written
to the export, so the question is asked once and the answer is reviewable in `git`.

The shipped `ds-theme` skill drives this conversationally and must **ask rather than pick** — the
rule the router already states. Naming the public API by inference is worse than guessing a layer,
because the wrong name ships.

## 4. Report what the design does not say

New findings in `ai-plugin/core/src/audit.ts`, beside `unboundColours`:

- **bound variable ids with no name from any source** — `high`, fix: name it in the palette frame
  or re-export the collection
- **two variables sharing one value** — `high`, fix: this is what makes them inseparable over REST
- **palette frame and bound variables disagree** — `medium`

Also correct `unboundColours`' title. It says colours are *"bound to no Style or Variable"*, which
is the wrong diagnosis for this file — every colour **is** bound. Split it into "not bound at all"
and "bound but unnamed", because the Figma actions differ.

## 5. The ratchet gate

`scripts/verify-tokens.mjs` has `checkDrift()` and `checkCollisions()` and exits `failed ? 1 : 0`.
Add `checkNaming()`:

- count `named: false` entries in the regenerated manifest (`tokens.json` already records the flag)
- compare against `naming.derivedBudget` in `design-system.json`
- **over budget → fail**, naming each new derived token and its value
- **under budget → fail**, telling you to lower the budget to the new number

The second half is what makes it a ratchet rather than a ceiling: progress locks in, and an
increase is always an explicit, reviewable edit.

## 6. `docs/token-naming.md`

For whoever works in Figma, not whoever reads the code:

- how a name becomes a CSS custom property — `primary` → `--color-primary`
- **defining is not applying** — lead with the spacing finding, since 7 variables exist, 0 are
  applied, and that is invisible from inside Figma
- **two variables must not share a value** unless you want them merged — the `#2563EB` case, with
  the Figma action
- keeping the `Color Palette` frame in step with the collection
- **who owns it and when: design, at stage 0 (Design Ready).** Token names are `@ds/theme`'s public
  API; with NX chained versioning a rename cascades to atoms → molecules → organisms. QA can only
  confirm the gate held — by QA the rename is a breaking change to code already written.
  `gates.md` makes this same argument for layer sorting: _"Sorting after development is what causes
  the refactor."_
- what the gate rejects, and how to read the theme story

Cross-reference — do not copy — from the shipped
`ai-plugin/cli/skills/design-system/references/theme.md` and from
`.claude/skills/ds-verify/references/gates.md`.

---

## Files

| Path                                       | Change                                                             |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `ai-plugin/emit-storybook/src/theme.ts`    | design name per token; merge warning; corrected wording            |
| `ai-plugin/testing/src/theme/assert.ts`    | `sources` on `ExpectedToken`; fail on multi-source tokens          |
| `ai-plugin/core/src/tokens/palette.ts`     | new — read the `Color Palette` frame as suggestions                |
| `ai-plugin/core/src/ir/style.ts`           | `ctx.variables`; `rectangleCornerRadii`; nested `firstAlias`       |
| `ai-plugin/core/src/ir/{layout,normalize}.ts` | thread `ctx`; `NormalizeInput.variables`                        |
| `ai-plugin/core/src/figma/variables.ts`    | new — parse the export, tolerant of two shapes                     |
| `ai-plugin/core/src/audit.ts`              | three findings; split `unbound-colours`                            |
| `ai-plugin/cli/src/index.ts`               | `variables` command — suggest, ask, write                          |
| `ai-plugin/cli/src/{config,pipeline}.ts`   | `variables` path, loaded and passed to `normalize()`               |
| `scripts/verify-tokens.mjs`                | `checkNaming()` ratchet                                            |
| `docs/token-naming.md`                     | new — the designer-facing guide                                    |
| `packages/theme/src/*`                     | regenerated: names change, merged tokens separate                  |

## Build order

1. **The story display.** Regenerate offline and look: it shows every token's Figma source beside
   its CSS variable, and flags the merges. Nothing else needs to exist first.
2. **Re-record the fixture live.** *This spends one Figma call* — the recording is from 25 Aug and
   predates the rename, so nothing after this step reflects the current file. Approving this plan
   approves that call; if the quota has not reset, everything below waits.
   Then step 1's story answers the open question: whether the rename produced readable names
   (Colour Styles) or not (Variables).
3. **The radius bug**, with a failing test first. Independent of naming.
4. **Thread `ctx.variables`**; `pnpm verify` stays green — no source yet, so names still derive.
5. **The palette reader**, then the export, then `figma2react variables` to resolve the remainder.
6. **Regenerate.** This renames the public surface of `@ds/theme` and cascades to the component
   packages — the breaking step.
7. Audit findings, then the ratchet gate with the budget set to whatever step 6 leaves.
8. `docs/token-naming.md`.

## Verification

1. **The story shows the design.** After step 1, every swatch carries its Figma source, and
   `--color-blue-600` visibly reports two sources — the merge, on screen.
2. **The radius bug fails before it passes.** A unit test asserting 11 `rectangleCornerRadii`
   bindings resolve; confirm red against current `main`.
3. **Names come through.** `packages/theme/src/tokens.json` contains `--color-primary` at
   `#2563eb` with `named: true`, and no token named `blue-600`.
4. **The merge is gone — the real test.** `background`, `card` and `primary-foreground` appear as
   three separate tokens all holding `#FFFFFF`; 8 bound variables yield 8 colour tokens, not 7.
5. **It asks rather than guesses.** With the palette present but the export absent,
   `figma2react variables` must resolve the 4 unambiguous colours and *ask* about the 4 that share
   a value — never silently name `border-focus` as `primary`.
6. **The ratchet fires both ways.** Add an unbound colour to the fixture → fail naming it. Bind one
   more → fail telling you to lower the budget. Break it deliberately before trusting it, as with
   `verify-skills.mjs`.
7. **Counts reconcile.** 10 colour / 7 spacing / 4 radius in the collection; the audit accounts for
   every one it does not emit, by cause.
8. **`pnpm verify` green** except during step 6, and story fidelity unchanged — renaming a token
   must not move a pixel.

## Out of scope

The Enterprise `/variables/local` endpoint (a silent upgrade once the join exists) · modes and dark
theme, though separating `background`/`card` is its prerequisite · applying the 7 spacing variables
in Figma, which is design work · `--prune` · Phase 2b's remaining steps.
