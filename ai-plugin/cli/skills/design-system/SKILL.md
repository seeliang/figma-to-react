---
name: design-system
description: 'Entry point for a figma-to-react design system. Routes to the right sub-skill for generating components from Figma, reviewing the design file for gaps, sorting components into atomic layers, and refreshing theme tokens. Use when the request mentions Figma, the design system, generating or regenerating components, design review, developer readiness, atoms/molecules/organisms, or design tokens.'
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - AskUserQuestion
  - Skill
  - Bash(figma2react *)
  - Bash(npx figma2react *)
  - Bash(git status *)
  - Bash(git diff *)
---

# Design system

`figma2react` generates Tailwind-styled React from a Figma frame over the REST API. This skill is
the front door; the work happens in the sub-skills below.

## Route first

| The request is about                                                    | Use                |
| ----------------------------------------------------------------------- | ------------------ |
| generating or regenerating components from Figma                        | `ds-generate`      |
| "is this ready for dev?", design gaps, unbound colours, unsorted layers | `ds-design-review` |
| colours, spacing, breakpoints, `tokens.css`, swatches, token naming     | `ds-theme`         |

If the request spans several, run `ds-design-review` first: an unbound colour or an unsorted
component shows up as noise in every other check until it is fixed.

When the request is genuinely ambiguous — "look at the design system" — ask with
`AskUserQuestion` rather than picking. Regenerating when someone wanted a review rewrites files
they did not ask you to touch.

Repositories usually add their own skills for what happens *after* generation — the build, the
tests, the delivery gates. Those are the repo's, not the tool's; hand off to them rather than
guessing at commands this tool does not own.

## Two rules that apply to every sub-skill

**1. Name design issues as design issues.** When the output is limited by what the Figma file
lacks — a colour bound to no Style, a component nobody sorted, a hover state that was never
designed — say so and name the Figma action that fixes it. Do not work around it silently, do not
invent the missing value, and do not report it as a limitation of the generator. A hover colour
nobody chose would be fabricated, not generated.

Keep the two causes apart when reporting:

- _"`--color-blue-600` is emitted because no Colour Style is bound to `#2563eb`"_ — design issue.
- _"the font family was dropped entirely"_ — tool bug, fix it in code.

**2. Offline is the default for questions; live spends a hard quota.** The Figma REST quota is set
by plan tier, and on the lower tiers one or two calls lock the API out for hours. `audit`,
`theme --audit` and `theme --diff` serve the recorded response by default; the commands that write
go live, because generating from a stale recording produces code that does not match the file.

Every run prints which mode it chose on stderr. Read it, and say which one the answer came from.
Only pass `--live` when the answer genuinely depends on the current state of the Figma file.

## Context

`design-system.json` holds the file key, the node, the output directory, the generation flags and
the layer sorting. The CLI finds it by walking up from the working directory. Read it rather than
asking; if it is missing, `figma2react init` writes it.

- [references/cli.md](references/cli.md) — every command and flag, and what each writes
- [references/atomic.md](references/atomic.md) — the three-layer model and its rules
- [references/theme.md](references/theme.md) — the theme, and why Tailwind's palette is not a target
