---
name: design-system
description: 'Entry point for the Figma-to-React design system in this repo. Routes to the right sub-skill for generating components from Figma, reviewing the design file for gaps, sorting components into atomic layers, refreshing theme tokens, and checking layout fidelity. Use when the request mentions Figma, the design system, generating or regenerating components, design review, developer readiness, atoms/molecules/organisms, or design tokens.'
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - Skill
  - Bash(node scripts/ds.mjs *)
  - Bash(pnpm *)
  - Bash(git status *)
  - Bash(git diff *)
---

# Design system

This repo generates Tailwind-styled React from a Figma frame over the REST API. This skill is the
front door; the work happens in the sub-skills below.

## Route first

| The request is about                                                    | Use                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------ |
| generating or regenerating components from Figma                        | `ds-generate`                                          |
| "is this ready for dev?", design gaps, unbound colours, unsorted layers | `ds-design-review`                                     |
| whether the code still matches Figma's geometry                         | `ds-fidelity` _(Phase 3)_                              |
| colours, spacing, breakpoints, `tokens.css`, swatches, token naming     | `ds-theme`                                             |
| one atomic layer specifically                                           | `ds-atoms`, `ds-molecules`, `ds-organisms` _(Phase 2)_ |

If the request spans several, run `ds-design-review` first: an unbound colour or an unsorted
component shows up as noise in every other check until it is fixed.

When the request is genuinely ambiguous — "look at the design system" — ask with
`AskUserQuestion` rather than picking. Regenerating when someone wanted a review rewrites files
they did not ask you to touch.

## Two rules that apply to every sub-skill

**1. Name design issues as design issues.** When the output is limited by what the Figma file
lacks — a colour bound to no Style, a component nobody sorted, a hover state that was never
designed — say so and name the Figma action that fixes it. Do not work around it silently, do not
invent the missing value, and do not report it as a limitation of the generator. A hover colour
nobody chose would be fabricated, not generated.

Keep the two causes apart when reporting:

- _"`--color-blue-600` is emitted because no Colour Style is bound to `#2563eb`"_ — design issue.
- _"the font family was dropped entirely"_ — tool bug, fix it in code.

**2. Offline is the default; live spends a hard quota.** The Figma REST quota is set by plan
tier, and this file is on Starter — exhausting it locks the API out for hours. Every command runs
against the recorded response in `tools/core/test/fixtures/design-system.json` unless `--live`
is passed. Only pass `--live` when the answer genuinely depends on the current state of the Figma
file, and say so when you do.

## Context

`design-system.json` at the repo root holds the file key, the node, the output directory and the
layer sorting. Read it rather than asking; if it is missing, `figma2react init` writes it.

- [references/cli.md](references/cli.md) — every command and flag, and what each writes
- [references/atomic.md](references/atomic.md) — the three-layer model and its rules
- [references/theme.md](references/theme.md) — the theme, and why Tailwind's palette is not a target
- [references/gates.md](references/gates.md) — what each delivery gate requires
