---
name: ds-verify
description: 'Runs and interprets this repository''s verification chain for the design system — the build, the unit tests, the generated-class check, token drift, and the Storybook fidelity and theme story tests. Also holds the facts specific to this repo: which Figma plan tier the quota is on, where the recorded fixture lives, and which delivery gate requires what. Use when asked to verify, to check the gates, whether something is Dev Complete or QA signed off, or what pnpm verify actually covers.'
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(pnpm verify)
  - Bash(pnpm test)
  - Bash(pnpm build)
  - Bash(pnpm typecheck)
  - Bash(node scripts/verify-*.mjs*)
  - Bash(pnpm --filter figma-to-react-example *)
  - Bash(git status *)
  - Bash(git diff *)
---

# Verify

The generator ships its own skills — `/design-system`, `/ds-generate`, `/ds-design-review`,
`/ds-theme` — from the `figma2react` plugin in `ai-plugin/cli/skills/`. Those cover Figma, generation
and the theme, and they know nothing about this repository on purpose.

**This skill is the other half: what this repo does with the output, and the facts only this repo
knows.**

## Facts the shipped skills deliberately do not carry

- **The Figma file is on the Starter tier.** One or two live calls exhaust the quota for hours, and
  the error names when it resets. This is why `--live` is a decision, not a habit.
- **The recording is `ai-plugin/core/test/fixtures/design-system.json`**, named as `offline.fixture` in
  `design-system.json`. Everything offline serves from it.
- **The example app is `figma-to-react-example`.** Its gallery (`examples/src/app.tsx`) is
  hand-maintained, so a variant renamed in Figma can leave it importing a file `gen` no longer
  writes.
- **A token collision is live**: the card fixture declares `--color-blue-600: #2663eb`, the design
  system `#2563eb`, and the later import wins. `verify-tokens.mjs` reports it. Known, not new.

## The chain

```
pnpm verify
```

Runs, in order: build · typecheck · unit tests · `verify-skills.mjs` · the example build ·
`verify-styles.mjs` · `verify-tokens.mjs` · the Storybook build · `verify-styles.mjs` against the
built Storybook · the story tests.

Each gate exists because it caught something eyeballing missed. Do not run a subset and call it
verified — say which gates you actually ran.

| Script                | Asserts                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `verify-skills.mjs`   | the shipped skills name only commands and flags the CLI actually has |
| `verify-styles.mjs`   | every generated class resolves to a real CSS rule in the built bundle |
| `verify-tokens.mjs`   | `tokens.json` still matches the design file; duplicate `--*` declarations |
| story play functions  | each token's swatch paints its declared value, in a real browser      |
| fidelity assertions   | every traced node within the configured threshold of Figma's geometry  |

## Reporting

Give the verdict first, then only what failed:

> `pnpm verify` green — 182 unit tests, 13 story tests, 123 classes resolving in both bundles,
> `tokens.json matches the design file: 8 token(s)`.

When something fails, quote the output rather than paraphrasing it, and separate the two causes:
a design-file gap is a Figma action (hand it to `/ds-design-review`); a generator fault is a code
fix here.

## Gates

[references/gates.md](references/gates.md) — what must be true to pass Developer Ready, Dev
Complete, QA Signoff and Release Ready, stated so each can fail.

## Releases

NX and CI own versioning. There is no semver, changelog or release command in this repo. Say that
rather than offering one.
