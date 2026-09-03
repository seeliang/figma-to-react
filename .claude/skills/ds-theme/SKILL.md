---
name: ds-theme
description: "Works on the design system's theme — colours, typefaces, spacing, breakpoints — across the delivery stages: checking the Figma file is ready to generate from, generating tokens.css and tokens.json, reviewing what changed, and verifying every token renders the value it declares. Use when the request mentions the theme, design tokens, colours, the palette, tokens.css, swatches, or why a token is named what it is."
allowed-tools:
  - Read
  - Glob
  - Bash(node scripts/ds.mjs *)
  - Bash(pnpm ds:*)
  - Bash(node scripts/verify-tokens.mjs)
  - Bash(pnpm --filter figma-to-react-example test-storybook)
  - Bash(pnpm verify)
  - Bash(git diff *)
  - Bash(git status *)
---

# Theme

Read [../design-system/references/theme.md](../design-system/references/theme.md) before advising on
naming. The short version: this design system is hand-tailored, Tailwind's palette is not a target,
and a derived name is a fallback that a Colour Style replaces.

## Work out the stage first

The theme has one command with modes, not five commands. Pick the stage the request is at:

| The request is                                     | Stage            | Run                                                   |
| -------------------------------------------------- | ---------------- | ----------------------------------------------------- |
| "is the design ready?", "why is it `blue-600`?"    | 0 · Design Ready | `pnpm ds:theme --audit`                               |
| "generate", "refresh", "pull in the colour change" | 1 · Generate     | `pnpm ds:theme`                                       |
| "did the tokens change?", reviewing a PR           | 3 · Review       | `pnpm ds:theme --diff`                                |
| "do the tokens actually work?"                     | 2 · Test         | `pnpm --filter figma-to-react-example test-storybook` |
| signing off                                        | 4 · QA           | `pnpm verify`                                         |

If the stage is genuinely unclear, run `--diff` first: it is offline, costs nothing, and tells you
whether there is anything to generate at all.

## Stage 0 comes before the others for a reason

Every colour in this file is currently unbound, so all eight names are derived. Generating and
testing derived names is fine, but understand what it buys: the names all change the moment
somebody binds a Colour Style. When someone asks for better names, the answer is stage 0, not a
regeneration.

Report it as a design issue with the Figma action, never as something to patch in code.

## Stage 1 — generating

```
pnpm ds:theme                      # live; reflects the current Figma file
node scripts/ds.mjs theme --offline  # from the recording; no quota spent
```

Writes `tokens.css`, `fonts.css`, `tokens.json`, and `theme.stories.tsx` — all from one collection
pass, which is why the theme comes out of `gen` rather than having its own generator.

Afterwards, read the import-order block if one is printed. `fonts.css` must come first; a CSS
`@import` is only valid ahead of every other rule, and getting it wrong fails silently in the
fallback typeface.

## Stage 2 — the test is generated, not written

`theme.stories.tsx` carries its own assertions, and the design decides how many. Seven colours in
the file means seven swatches and seven checked values; an eighth appears in the test the moment
it appears in Figma.

The play function checks the **count first**, then the values. A token with no swatch is the
failure a per-swatch loop skips over, and it is also the likeliest one — it means the design gained
something the page does not know about.

Never hand-edit `theme.stories.tsx`. It is overwritten every run.

## Stage 3 — reviewing

`pnpm ds:theme --diff` prints added, removed and changed tokens against the committed
`tokens.json`. This is what belongs in a PR description.

## Stage 4 — verifying

`pnpm verify` runs three checks in three places, deliberately:

| Check                | Where                            | Catches                                                     |
| -------------------- | -------------------------------- | ----------------------------------------------------------- |
| rendered vs declared | the story's play function        | a token that never reached the bundle, or was overridden    |
| committed vs Figma   | `scripts/verify-tokens.mjs`      | the design moved and nobody regenerated; hand-edited output |
| stable and unique    | `tools/core/test/tokens.test.ts` | a naming change that would silently rename tokens           |

`verify-tokens.mjs` also reports properties declared twice at different values across the imported
`@theme` blocks. There is one live today — see the reference.

## Releases

NX and CI own versioning. There is no semver, changelog or release command here. Say that rather
than offering one.
