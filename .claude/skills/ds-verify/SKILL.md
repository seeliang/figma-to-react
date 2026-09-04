---
name: ds-verify
description: "Runs and interprets this repository's verification chain for the design system — the build, the unit tests, the generated-class check, token drift, and the Storybook fidelity and theme story tests. Also holds the facts specific to this repo: which Figma plan tier the quota is on, where the recorded fixture lives, and which delivery gate requires what. Use when asked to verify, to check the gates, whether something is Dev Complete or QA signed off, or what pnpm verify actually covers."
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
  - Bash(pnpm build-storybook)
  - Bash(pnpm test-storybook)
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

- **The Figma file is on the Professional tier** (upgraded 4 Sep 2026). Tier 1 reads are 15/min
  rather than a monthly budget, so `--live` no longer risks locking the API out for days. It still
  costs quota and still returns a _different_ file than the recording, so offline stays the default
  for questions a recording can answer — the error names the reset when it does bite.
- **The recording is `ai-plugin/core/test/fixtures/design-system.json`**, named as `offline.fixture` in
  `design-system.json`. Everything offline serves from it.
- **There is no example app.** It was retired in favour of Storybook: stories live beside the
  components in `packages/*/src`, and the root Storybook discovers them. A variant renamed in
  Figma can still leave an orphaned file behind, because `gen` does not delete — check
  `git status` after generating.
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

| Script               | Asserts                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `verify-skills.mjs`  | the shipped skills name only commands and flags the CLI actually has      |
| `verify-styles.mjs`  | every generated class resolves to a real CSS rule in the built bundle     |
| `verify-tokens.mjs`  | `tokens.json` still matches the design file; duplicate `--*` declarations |
| story play functions | each token's swatch paints its declared value, in a real browser          |
| fidelity assertions  | every traced node within the configured threshold of Figma's geometry     |

## Reporting

Give the verdict first, then only what failed:

> `pnpm verify` green — 183 unit tests, 14 story tests, 23 generated classes resolving in the
> Storybook bundle, `tokens.json matches the design file: 11 token(s)`.

These numbers move whenever the design file does, so read them off the run rather than repeating
them: they are the shape of a good report, not a target to match.

When something fails, quote the output rather than paraphrasing it, and separate the two causes:
a design-file gap is a Figma action (hand it to `/ds-design-review`); a generator fault is a code
fix here.

## Gates

[references/gates.md](references/gates.md) — what must be true to pass Developer Ready, Dev
Complete, QA Signoff and Release Ready, stated so each can fail.

## Releases

NX and CI own versioning. There is no semver, changelog or release command in this repo. Say that
rather than offering one.
