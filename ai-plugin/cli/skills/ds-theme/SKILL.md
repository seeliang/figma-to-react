---
name: ds-theme
description: "Works on the design system's theme — colours, typefaces, spacing, breakpoints — across the delivery stages: checking the Figma file is ready to generate from, generating tokens.css and tokens.json, reviewing what changed, and verifying every token renders the value it declares. Use when the request mentions the theme, design tokens, colours, the palette, tokens.css, swatches, or why a token is named what it is."
allowed-tools:
  - Read
  - Glob
  - Bash(figma2react theme*)
  - Bash(figma2react audit*)
  - Bash(npx figma2react *)
  - Bash(git diff *)
  - Bash(git status *)
---

# Theme

Read [../design-system/references/theme.md](../design-system/references/theme.md) for what the theme
covers. For colour specifically — naming, and why a token is called what it is — use `ds-color`,
which owns those rules; a derived name is only ever a fallback for one the design did not supply.

## Work out the stage first

The theme has one command with modes, not five commands. Pick the stage the request is at:

| The request is                                     | Stage            | Run                           |
| -------------------------------------------------- | ---------------- | ----------------------------- |
| "is the design ready?", "why is it `blue-600`?"    | 0 · Design Ready | `figma2react theme --audit`   |
| "generate", "refresh", "pull in the colour change" | 1 · Generate     | `figma2react theme`           |
| "did the tokens change?", reviewing a PR           | 3 · Review       | `figma2react theme --diff`    |
| "do the tokens actually work?"                     | 2 · Test         | the repo's story test command |
| signing off                                        | 4 · QA           | the repo's verify chain       |

Stages 0, 1 and 3 are this tool. Stages 2 and 4 belong to the repository — the theme story carries
its own assertions, but running them is the repo's build, not the generator's.

If the stage is genuinely unclear, run `--diff` first: it is offline, costs nothing, and tells you
whether there is anything to generate at all.

## Stage 0 comes before the others for a reason

Run it and read the colour finding before advising on names. Where colours are unbound, their names
are _derived_ — and every one of them changes the moment somebody binds a Colour Style. When someone
asks for better names, the answer is stage 0, not a regeneration.

Report it as a design issue with the Figma action, never as something to patch in code.

## Stage 1 — generating

```
figma2react theme              # live; reflects the current Figma file
figma2react theme --offline    # from the recording; no quota spent
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

`figma2react theme --diff` prints added, removed and changed tokens against the committed
`tokens.json`. It is offline by default, so checking costs nothing. This is what belongs in a PR description.

## Stages 2 and 4 — testing and verifying

These belong to the repository, not to this tool. What the tool guarantees is that the generated
`theme.stories.tsx` carries assertions for **every** token, so the design decides how many there
are. Running them, and whatever else the repo gates on, is the repo's chain — hand off to its own
skill rather than inventing a command.

Three checks worth insisting on wherever they live, because each catches something the others
cannot:

| Check                | Where                     | Catches                                                     |
| -------------------- | ------------------------- | ----------------------------------------------------------- |
| rendered vs declared | the story's play function | a token that never reached the bundle, or was overridden    |
| committed vs Figma   | `theme --diff`, in CI     | the design moved and nobody regenerated; hand-edited output |
| stable and unique    | the generator's own tests | a naming change that would silently rename tokens           |

## Releases

Versioning belongs to whatever the repository uses for it. This tool has no semver, changelog or
release command. Say that rather than offering one.
