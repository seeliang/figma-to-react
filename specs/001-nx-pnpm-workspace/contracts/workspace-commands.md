# Contract: Workspace commands

**Feature**: `001-nx-pnpm-workspace` · **Consumers**: contributors, the pipeline

The command surface the repository promises. A contributor and CI use **the same commands**; a
pipeline-only invocation is a bug, because it means CI is verifying something no contributor can
reproduce.

## Setup

| Command | Contract |
| ------- | -------- |
| `export NODE_AUTH_TOKEN=<classic PAT with read:packages>` | Required before the first install. **Classic** tokens only — fine-grained tokens do not work with GitHub Packages. |
| `pnpm install` | Installs every project's dependencies (FR-001). Fails naming the missing credential if `NODE_AUTH_TOKEN` is absent (FR-003). Fails naming the required version on a package-manager or Node mismatch (FR-005). |
| `pnpm install --frozen-lockfile` | As above, and fails if resolution would change (FR-006). What CI runs. |

**Exit contract on missing credential** (FR-003, SC-002) — the message must name the variable, the
required token type and where to read more. A bare `401` does not satisfy this.

## Verification

| Command | Contract |
| ------- | -------- |
| `pnpm build` | Builds every project defining `build`, dependencies first (FR-007, FR-010). Skips projects without it (FR-009). |
| `pnpm test` | As above, for `test`. |
| `pnpm lint` | As above, for `lint`. |
| `pnpm typecheck` | As above, for `typecheck`. |
| `pnpm verify` | All four, in one command. What CI runs and what a contributor runs before pushing. |

**Per-project form** (FR-008): `pnpm nx build @seeliang/f2r-cli` builds `f2r-core` first and does not
touch `packages/theme`.

**Zero-project contract** (FR-048): every command above exits `0` on a workspace with no projects.
Satisfied by never hard-coding a project name.

## Change-scoped

| Command | Contract |
| ------- | -------- |
| `pnpm nx affected -t build test lint typecheck --base=origin/release` | Runs only the changed projects and their transitive dependents (FR-018, FR-019). The base is `release`, this project's integration branch — `main` belongs to an unrelated lineage in the same repository (research R0). |
| *(base revision absent)* | **Reports the missing base and exits non-zero** (FR-023). It must never resolve to an empty project set and report success — that failure is green, which makes it the dangerous one. |

## Caching

| Command | Contract |
| ------- | -------- |
| *(repeat any task, no changes)* | Reuses the stored result; does not re-execute (FR-020). |
| *(change any declared input)* | Re-executes (FR-019). A change in `core` re-executes `cli` (FR-021). |
| `pnpm nx <task> <project> --skip-nx-cache` | Forces re-execution (FR-022). |
| `pnpm nx reset` | Discards stored results (FR-022). |

## Inspection

| Command | Contract |
| ------- | -------- |
| `pnpm nx graph` | Shows projects and the edges between them (FR-015). `f2r-cli → f2r-core` is present; `f2r-theme` is isolated. |
| `pnpm nx show projects` | Lists all three. |
| *(a cycle exists)* | Any workspace command exits non-zero naming both projects (FR-014). Never hangs, never picks an order. |

## Release

**Publishing is refused outside the pipeline** (FR-030). A local `pnpm publish` must fail; the
publish credential exists only inside the release job.

| Command | Where | Contract |
| ------- | ----- | -------- |
| `pnpm nx release version <v>` | pipeline | Bumps independently; bumping `f2r-core` also bumps `f2r-cli` (FR-028). |
| `pnpm nx release publish --dry-run` | pipeline | Runs first. A failure here costs nothing. |
| `pnpm nx release publish` | pipeline | Publishes via `pnpm publish`, rewriting `workspace:*` (FR-026). Reports per-project outcome (FR-038). |
| `pnpm nx release publish --projects=<remaining>` | pipeline | Resumes after a partial failure, same version (FR-038). |
| `node scripts/verify-no-workspace-refs.mjs` | both | Packs every publishable project and fails if any tarball's manifest contains `workspace:` (FR-027). Runs in CI **and** is runnable locally. |
| *(version already published)* | pipeline | Fails loudly (FR-045). Not a warning, not a skip. |

## Stability

These names are the contract. Adding a command is compatible; renaming or removing one breaks every
contributor's muscle memory and every workflow file, and requires updating this document, the README
(FR-049) and `quickstart.md` in the same change.
