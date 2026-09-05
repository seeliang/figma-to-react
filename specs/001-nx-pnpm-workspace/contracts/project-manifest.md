# Contract: Project manifest

**Feature**: `001-nx-pnpm-workspace` · **Consumers**: anyone adding a project (FR-016, User Story 7)

What a directory must declare to become a project in this workspace. Satisfying this contract is
**sufficient** — there is no central list to edit, no `nx.json` entry to add, no generator to run
(FR-016, SC-012).

## Location

Under `ai-plugin/` or `packages/`, one directory deep. Anywhere else and the workspace will not see
it.

The choice is not cosmetic — constitution **P2**: consumer-installable code in `packages/`,
generator and repository tooling in `ai-plugin/`. Under `packages/`, constitution **P4**
additionally forbids authored source *inside* `src/` — everything there is generated. Boundary files
beside `src/` (`package.json`, `tsconfig.json`) are authored, and are the only authored paths a
package under `packages/` may have.

## Required

```jsonc
{
  "name": "@seeliang/<name>",          // scope must match the repository owner
  "version": "0.1.0",
  "type": "module",
  "repository": {                       // GitHub Packages REQUIRES this to bind package to repo
    "type": "git",
    "url": "git+https://github.com/seeliang/figma-to-react.git",
    "directory": "<path from repo root>"
  },
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "files": ["dist"]                     // what enters the tarball — nothing else does
}
```

`repository` is the field most often forgotten and the one whose absence fails at publish time
rather than at build time — the most expensive moment to find out.

## Tasks

A project defines whichever of the four it can honestly run. Omitting one is legitimate and is
skipped, not failed (FR-009).

```jsonc
"scripts": {
  "build":     "tsc -b",
  "test":      "vitest run",
  "typecheck": "tsc -b --noEmit",
  "lint":      "prettier --check ."
}
```

The command lives **here**, in the project's own manifest — never in `nx.json`. Nx schedules and
caches these scripts; it does not supply them. This is constitution **P1**: a reader finds the real
command in the package they are reading, not in a configuration file elsewhere.

`packages/theme` defines none of them (FR-039b), and is the repository's live proof that the skip
path works.

## Dependencies

| Kind | Declare as | Notes |
| ---- | ---------- | ----- |
| Another project here | `"@seeliang/f2r-core": "workspace:*"` | Resolves to local source in development; `pnpm publish` rewrites it to a concrete version in the tarball. **Never** write a plain version range for a workspace project — pnpm 10+ does not link workspace packages by version by default, so it would be fetched from the registry instead. |
| Anything else | `"pkg": "^1.2.3"` | Pinned by the lockfile (FR-025). |

**Every declared dependency must be used in source.** FR-013 forbids declaring a dependency to
produce a graph edge; constitution **P6** requires the graph to reflect the real dependency
direction. An unused dependency is a lie in the graph, and the graph is what versioning and affected
detection trust.

## TypeScript

A buildable project also needs `tsconfig.json` extending `tsconfig.base.json`, with a `references`
entry for each internal dependency, and a matching entry in the root solution `tsconfig.json`.

This mirrors the manifest edge without re-declaring the dependency: the manifest says *what this
package needs*, the reference says *what must compile first*. If they ever disagree, the manifest is
right and the reference is stale.

## Checklist for a new project

- [ ] Directory under `ai-plugin/` or `packages/`
- [ ] `name`, `version`, `type`, `repository` (with `directory`), `publishConfig`, `files`
- [ ] Scripts for the tasks it can run — in this manifest, not in `nx.json`
- [ ] Internal deps as `workspace:*`; every dep used in source
- [ ] `tsconfig.json` with `references`; added to the root solution file
- [ ] `pnpm install` re-run to record the resolution
- [ ] **Nothing added to any central list** — if a step required that, the workspace is misconfigured
      (SC-012)
