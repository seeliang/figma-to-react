# Examples restructure plan

## Goal

`examples/` is currently both a standalone Vite demonstration app and the home of generated
design-system source. The standalone app duplicates Storybook's role: `index.html` mounts a
hand-written gallery, while `fidelity.html` presents a report that the generated Storybook play
functions already check in a real browser.

Remove `examples/` entirely. Root Storybook becomes the sole interactive demonstration tool, while
stories remain beside the components they document in `packages/`. Consumer-installable
design-system layers belong in `packages/`; generator, shared configuration and test helpers belong
in `ai-plugin/`. This creates the real dependency graph NX needs for versioning and affected detection.

## Target layout

```
ai-plugin/                              generator and repository tooling; never shipped to consumers
  core/  emit-react/  emit-storybook/  cli/
  config/                           shared Vite, Vitest, Storybook and TS presets
  testing/                          generated-story and fidelity assertions

packages/                           consumer-installable design-system packages
  theme/                            tokens.css, fonts.css, tokens.json, theme stories
  atoms/                            Button and Input Field; depends on theme
  molecules/                        Form Field; depends on theme and atoms
  organisms/                        reserved package; depends on lower layers

.storybook/                         the one interactive demo surface
  main.ts                           glob packages/*/src/**/*.stories.tsx
  preview.ts                        global annotations and stylesheet
  styles.css                        font-first theme imports and Tailwind source globs
  vitest.setup.ts                   applies preview annotations to browser story tests
vite.config.ts                      Vite plugins used by root Storybook
vitest.config.ts                    one Storybook browser-test project
```

The package graph is deliberately one-way:

```
@ds/theme <- @ds/atoms <- @ds/molecules <- @ds/organisms
```

Every component package also depends directly on `@ds/theme`. Generated imports across layers must
use package specifiers (for example, `@ds/atoms`), never relative paths. An invalid upward
dependency then fails package typechecking instead of merely raising an audit warning.

## Ownership rules

- A component, token, font or story that a downstream application installs goes in `packages/`.
- Stories stay beside the components they document. Root Storybook discovers them; its
  configuration is not copied into each package.
- Generated fidelity assertions use `@figma-to-react/testing`; each generated story supplies its
  package geometry to the shared helper. No standalone report page is needed.
- The card and button files under `examples/src/generated/` are only rendered by the Vite gallery.
  They are not imported by production code or tests, so remove them rather than moving them.
- Keep source Figma fixtures used by generator tests in `ai-plugin/*/test/fixtures`; they do not need
  an interactive gallery to remain covered.

## Migration plan

1. Create root `.storybook/`, `vite.config.ts` and `vitest.config.ts` from the existing example
   configuration. Move the global stylesheet to `.storybook/styles.css`; it imports theme fonts
   before Tailwind, imports theme tokens, and declares `@source` globs for package source. Declare
   Storybook, React, Vite and browser-test dependencies in the root `package.json`.
2. Update `emit-react` and its snapshots so cross-layer component references emit `@ds/*` imports.
   Do this before moving files, because it establishes the architectural boundary.
3. Change `design-system.json` from one `out` directory to a layer-to-package map, and route
   `figma2react gen` / `ds:gen --layer` through that map.
4. Create the four packages, generate their source into `packages/*/src`, then remove
   `examples/src/design-system/`.
5. Point root Storybook at `packages/*/src/**/*.stories.tsx` and run its browser tests. Delete
   `examples/index.html`, `fidelity.html`, `src/{main,app,fidelity}.tsx`, local assertion wrappers,
   `vite.config.ts`, `vitest.config.ts`, `package.json`, and `src/generated/`.
6. Replace hard-coded `examples/src/design-system` paths in style/token checks with paths derived
   from `design-system.json`. Build Storybook for the CSS check and add a regeneration idempotence
   check for every package.
7. Add NX targets and release configuration only after the package graph is enforced and all
   existing verification remains green.

## Acceptance checks

- `pnpm verify` remains green throughout the migration.
- `pnpm ds:gen` followed by `git diff --exit-code packages/*/src` is clean.
- `pnpm ds:gen --layer atoms` changes only the atoms package.
- An import from `@ds/atoms` to `@ds/molecules` fails typechecking.
- Root Storybook discovers every package story and its browser tests pass.
- There is no `examples/` workspace, Vite demo entry point, or standalone fidelity page remaining.
- Component story play functions continue to enforce the current fidelity threshold in a real
  browser; the removed report page was observational only.
- After NX is enabled, its graph shows the dependency chain above and affected detection follows it.

## Deliberate non-goals

This restructure does not publish packages, create a Storybook per package, retain a generic Vite
demo app, or split into a package per component. Those are future decisions once the layer packages
and their dependency graph are proven.

For the related package-level implementation detail, see [Phase 2b — split the design system into
per-layer packages](design-system-packages-plan.md).
