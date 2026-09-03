---
name: ds-generate
description: 'Generates React components from the Figma file behind this repo, using design-system.json for the file key, node, output directory and atomic layer sorting. Sets the config up first on a fresh checkout. Use when asked to generate, regenerate or refresh components from Figma, to pull in a design change, or to set up the design system for the first time.'
allowed-tools:
  - Read
  - Glob
  - Bash(node scripts/ds.mjs *)
  - Bash(pnpm ds:*)
  - Bash(pnpm verify)
  - Bash(pnpm --filter figma-to-react-example *)
  - Bash(git status *)
  - Bash(git diff *)
  - AskUserQuestion
---

# Generate

Runs the generator from `design-system.json`, so nobody has to recall the file key or which flags
the fidelity check depends on.

## Steps

1. **Check the config exists.** `cat design-system.json`. If it is missing, this is a fresh
   checkout — run `pnpm ds:init` first. That command asks which part of the Figma file to generate
   from, then proposes a layer for each component it finds. Let the person confirm each one; pass
   `--yes` only when they have explicitly asked for it to be non-interactive.

2. **Generate.**

   ```
   pnpm ds:gen                      # live: reflects the current Figma file
   node scripts/ds.mjs gen --offline  # from the recording; no quota spent
   ```

   `gen` defaults to **live** on purpose — generating from a stale recording produces code that
   does not match the file. Use `--offline` deliberately: when the quota is spent, or when only
   the layer sorting changed and the Figma data did not.

   To regenerate one layer rather than everything, pass `--layer atoms` _(Phase 2)_. A one-atom
   change buried in a whole-tree rewrite is not reviewable.

3. **Read the output, do not just report success.** Three things in it matter:
   - the **warnings** — assets Figma could not export, stories generated without `--trace-ids`
   - the **design notes** — gaps in the Figma file; hand these to `ds-design-review` rather than
     summarising them here
   - the **import order block**, if a theme was written. `fonts.css` must come first; a CSS
     `@import` is only valid ahead of every other rule, and getting this wrong fails silently.

4. **Check for orphans.** `git status` on the output directory. `gen` never deletes, so a variant
   renamed in Figma leaves its old file behind — still compiling, still imported, quietly stale.
   Remove them, and check whether `examples/src/app.tsx` imported any (it is hand-maintained).

5. **Verify.** `pnpm verify`. The chain covers the build, the unit tests, that every generated
   class resolves to a real CSS rule, and that every story is still within the fidelity threshold.
   Each of those gates was added because it caught something eyeballing missed.

## Reporting

Say what changed, not that the command ran:

> Regenerated 17 components. Four are new — `button-primary-hover`, `button-secondary-hover`,
> `button-ghost-hover`, `input-field-hover` — because the Figma file gained Hover variants, which
> the audit had been asking for. Removed three orphans left by the rename. `pnpm verify` green,
> 11/11 stories within 4px.

## Rate limits

The Figma REST quota is set by plan tier, and this file is on Starter — one or two calls can
exhaust it for hours. The error names when it resets. When it fires, switch to `--offline` and say
that the output reflects the recording rather than the live file; do not retry in a loop.
