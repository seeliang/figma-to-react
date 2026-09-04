# Architecture

> Spec-driven stage: **constitution** — the principles every other stage obeys.
> See [README.md](README.md) for the pipeline, [ai-solution.md](ai-solution.md) for why.

## Overall
Read Figma design, generate React code with vanilla CSS and component are host with storybook. 

## Separation of concerns

Each part of the repository should have one clear responsibility and keep its documentation,
implementation and tests close together.

- Stories live beside the components they document; a single root Storybook discovers and presents
  them.
- A plugin keeps its instructions, executable code and distribution metadata in the same scope.
- Consumer-installable code belongs in `packages/`; generator and repository tooling belongs in
  `ai-plugin/`.

Prefer a shallow structure where ownership is obvious from the path. Do not create a new directory
unless it establishes a useful boundary.

## Where files live

Every path under `packages/` is one of the three kinds in
[ai-solution.md](ai-solution.md), and which one it is must be readable from the name alone.

```
docs/                                  decisions — why, not how

packages/theme/src/
  color.feature                        SPEC       authored, beside what it tests
  figma-tokens.md  figma-tokens.json   PROJECTION regenerated
  tokens.css  tokens.json  fonts.css   ARTIFACT   regenerated
  theme.stories.tsx                    ARTIFACT   regenerated

packages/<component>/src/
  <component>.feature                  SPEC       authored
  <Component>.tsx  styles.css          ARTIFACT   regenerated
  <Component>.stories.tsx              ARTIFACT   regenerated

ai-plugin/cli/
  .claude-plugin/plugin.json           version-locked to package.json
  skills/
    design-system/SKILL.md             router
    ds-audit/SKILL.md                  gate
    ds-theme/SKILL.md                  topic: theme
    ds-generate/SKILL.md               generate
    ds-verify/SKILL.md                 verify
```

Two rules keep the tree honest:

- **`.feature` files are the only authored files under `packages/`.** Everything else there is
  regenerated, so a hand edit anywhere else is a change the next `gen` deletes.
- **Skills live in `ai-plugin/cli/skills/`, named by stage or topic — never by role.** The location
  is what makes them ship and version with the CLI (see [Distribution](#distribution)); the naming
  is because roles are responsibilities, not processes. A skill called `qa` re-encodes the role split
  as an execution path, and people ask "why is this colour wrong", not "be the QA".

There is no `specs/` directory and no file called `spec.md`. The requirements-design-tasks triple
that mainstream spec-driven tooling authors in prose is the step this project skips, because the
design file is already the specification — the reasoning is in
[ai-solution.md](ai-solution.md).

Directories appear when their first real file does. Do not scaffold them ahead of time.

## Configuration and styling scope

Use native platform configuration and standard web primitives first: TypeScript project references,
Vite's React plugin, ordinary CSS, and CSS custom properties. Generated React components own a
nearby `styles.css`; the shared theme package owns `fonts.css` and `tokens.css`.

**This is a pure CSS project.** Utility frameworks, configuration layers, presets and
design-system wrappers are out of scope. Popularity is not sufficient reason to add a dependency:
introduce a tool only when it removes a demonstrated project-specific problem and does not obscure
the native configuration it replaces.

## Package versioning
the plugin script run will remove code source code and storybook, and regenerate those code. 

## Distribution

NX and CI manage semantic versioning and releases. The workspace dependency graph must reflect the
real dependency direction so chained versioning and affected detection are reliable.

The Claude Code plugin is part of the `ai-plugin/cli` NX project, not a separate project. Its skills,
manifest and executable code ship in the same `@figma-to-react/cli` package, so they build, test,
pack and release together. NX inputs for the CLI include the plugin files, and
`.claude-plugin/plugin.json` must remain version-locked to `ai-plugin/cli/package.json`. Root
marketplace and settings files participate in CLI verification only when they affect the dogfooded
plugin installation.
