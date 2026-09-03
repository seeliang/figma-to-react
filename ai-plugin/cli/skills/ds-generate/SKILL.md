---
name: ds-generate
description: 'Generates React components from the Figma file behind the design system, using design-system.json for the file key, node, output directory and atomic layer sorting. Sets the config up first on a fresh checkout. Use when asked to generate, regenerate or refresh components from Figma, to pull in a design change, or to set up the design system for the first time.'
allowed-tools:
  - Read
  - Glob
  - Bash(figma2react *)
  - Bash(npx figma2react *)
  - Bash(git status *)
  - Bash(git diff *)
  - AskUserQuestion
---

# Generate

Runs the generator from `design-system.json`, so nobody has to recall the file key or which flags
the fidelity check depends on.

## Steps

1. **Check the config exists.** `cat design-system.json`. If it is missing, this is a fresh
   checkout — run `figma2react init` first. That command asks which part of the Figma file to generate
   from, then proposes a layer for each component it finds. Let the person confirm each one; pass
   `--yes` only when they have explicitly asked for it to be non-interactive.

2. **Generate.**

   ```
   figma2react gen              # live: reflects the current Figma file
   figma2react gen --offline    # from the recording; no quota spent
   ```

   The target, the output directory and the generation flags all come from `design-system.json`,
   so neither a URL nor a pile of flags is needed. `gen` defaults to **live** on purpose — generating from a stale recording produces code that
   does not match the file. Use `--offline` deliberately: when the quota is spent, or when only
   the layer sorting changed and the Figma data did not.

   To regenerate one layer rather than everything, pass `--layer atoms`. A one-atom change buried
   in a whole-tree rewrite is not reviewable.

3. **Read the output, do not just report success.** Three things in it matter:
   - the **warnings** — assets Figma could not export, stories generated without `--trace-ids`
   - the **design notes** — gaps in the Figma file; hand these to `ds-design-review` rather than
     summarising them here
   - the **import order block**, if a theme was written. `fonts.css` must come first; a CSS
     `@import` is only valid ahead of every other rule, and getting this wrong fails silently.

4. **Check for orphans.** `git status` on the output directory. `gen` never deletes, so a variant
   renamed in Figma leaves its old file behind — still compiling, still imported, quietly stale.
   Remove them, and check whether any hand-maintained file still imports them. This is a gap in the
   tool rather than something you should have to remember; say so when it bites.

5. **Hand off to the repository's own checks.** Generation is not the gate. Whatever the repo runs
   to prove the output still builds, still resolves every class, and still matches Figma's geometry
   is the thing that decides whether the change is good — run it, and report what it said.

## Reporting

Say what changed, not that the command ran:

> Regenerated 17 components. Four are new — `button-primary-hover`, `button-secondary-hover`,
> `button-ghost-hover`, `input-field-hover` — because the Figma file gained Hover variants, which
> the audit had been asking for. Removed three orphans left by the rename. The repo's verify chain
> is green, 11/11 stories within 4px.

## Rate limits

The Figma REST quota is set by plan tier, and on the lower tiers one or two calls can exhaust it
for hours. The error names when it resets. When it fires, switch to `--offline` and say
that the output reflects the recording rather than the live file; do not retry in a loop.
