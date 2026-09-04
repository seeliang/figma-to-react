# Delivery gates

What must be true to pass each gate, stated so it can fail. The generator's own commands are
documented in the `figma2react` plugin, at `ai-plugin/cli/skills/design-system/references/cli.md`.

> A full user-facing version, mapping every agile stage to a command, is planned for Phase 3 and
> is not written yet. This is the criteria list the skills check against now.

## Developer Ready

Before anyone writes code against the design.

- zero `high` audit findings
- every component sorted into a layer, with ownership declared
- the node in `design-system.json` points at a frame that has Auto Layout
- every interactive component set has the states it needs

Sorting sits at _this_ gate deliberately. Sorting after development is what causes the refactor.

**Check:** `figma2react audit` (offline by default)

## Dev Complete

- `pnpm verify` green
- `git diff --exit-code packages/` clean after regenerating — the real assertion that the
  committed code matches the current Figma file
- no orphaned files from renamed variants (`gen` does not delete)

## QA Signoff

- fidelity within the configured threshold (4px; currently 11/11 stories pass)
- accessibility violations either fixed in code or filed as Figma actions, none unresolved
- e2e green

_(a11y and e2e arrive in Phase 3.)_

## Release Ready

- no high or critical advisories, no secret-scan hits
- coverage at or above threshold
- token diff empty
- a version-record entry exists naming the Figma file version this build came from

_(Phase 2 and 3.)_
