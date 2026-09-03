# Architecture

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

## Distribution

NX and CI manage semantic versioning and releases. The workspace dependency graph must reflect the
real dependency direction so chained versioning and affected detection are reliable.

The Claude Code plugin is part of the `ai-plugin/cli` NX project, not a separate project. Its skills,
manifest and executable code ship in the same `@figma-to-react/cli` package, so they build, test,
pack and release together. NX inputs for the CLI include the plugin files, and
`.claude-plugin/plugin.json` must remain version-locked to `ai-plugin/cli/package.json`. Root
marketplace and settings files participate in CLI verification only when they affect the dogfooded
plugin installation.

For the Storybook-first examples migration, see
[Examples restructure plan](examples-restructure-plan.md).
