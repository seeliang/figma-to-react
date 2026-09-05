# Phase 1 Data Model: Workspace configuration

**Feature**: `001-nx-pnpm-workspace` · **Date**: 2026-09-05

This feature stores no application data. Its "model" is **configuration** — the entities of the
spec's *Key Entities* section, realised as files, plus the invariants that must hold between them.
Each entity below names where it lives, what it must declare, and what would make it wrong.

---

## Workspace

**Realised by**: `pnpm-workspace.yaml`, `nx.json`, root `package.json`, `.npmrc`, `tsconfig.json`

| Field | Value | Requirement |
| ----- | ----- | ----------- |
| recognised project locations | `ai-plugin/*`, `packages/*` | FR-016 — membership is by location, not by a list of names |
| package manager | `pnpm@11.25.0`, exact, in `packageManager` | FR-005 |
| runtime range | `engines.node: ">=26"` | FR-005. Node 26 is *Current* until late Oct 2026 — deliberate; see research R5 for why, and for the note that a published package's range is a separate decision from the workspace's. |
| scope map | `@seeliang:registry=https://npm.pkg.github.com` | FR-002 |
| auth reference | `${NODE_AUTH_TOKEN}`, never a literal | FR-034 |
| root privacy | `"private": true` | the root is not publishable |

**Invariants**

- **W1** — `pnpm-workspace.yaml` lists locations, never individual projects. A new project appears by
  existing (FR-016).
- **W2** — `.npmrc` contains no credential in any form, only an environment reference (FR-034).
- **W3** — Exactly one lockfile exists, at the root (FR-004).
- **W4** — Every workspace-wide command succeeds when the project set is empty (FR-048). This holds
  by construction if no command hard-codes a project name.

---

## Project

**Realised by**: a directory under a recognised location, containing `package.json`

| Field | Required of | Purpose |
| ----- | ----------- | ------- |
| `name` | all | `@seeliang/<name>`; the graph node's identity |
| `version` | all | `0.1.0` at first release (FR-042) |
| `repository` | all publishable | **GitHub Packages requires it** to bind the package to its repository |
| `publishConfig.registry` | all publishable | `https://npm.pkg.github.com` |
| `files` | all publishable | what enters the tarball |
| `scripts.{build,test,lint,typecheck}` | `ai-plugin/*` only | FR-039a |
| `dependencies` | as real | the sole source of graph edges (FR-011) |

**The three projects**

| Path | Name | Tasks | Edges |
| ---- | ---- | ----- | ----- |
| `ai-plugin/core` | `@seeliang/f2r-core` | all four | none |
| `ai-plugin/cli` | `@seeliang/f2r-cli` | all four | → `f2r-core` (internal), → `github-package-sample` (external) |
| `packages/theme` | `@seeliang/f2r-theme` | **none** | none |

**Invariants**

- **P1** — A project's tasks are declared in its own `scripts`. Nothing in `nx.json` supplies a task
  a package does not have (constitution P1: Nx orchestrates, it does not wrap).
- **P2** — `packages/theme` contains `package.json` and `README.md` and nothing else. A
  `packages/theme/src/` authored by hand is a constitution **P4** violation; boundary files beside
  `src/` are not (P4 as corrected in 4.0.0). Its content arrives generated, or not at all (FR-039b).
- **P3** — Every dependency corresponds to a real use in source (FR-013, FR-040, FR-041). A
  dependency declared and unused is a manufactured edge.

---

## Edge

Two kinds, and the distinction is the whole point of the feature.

| | Internal edge | External edge |
| --- | --- | --- |
| Example | `"@seeliang/f2r-core": "workspace:*"` | `"@seeliang/github-package-sample": "^x.y.z"` |
| Declared in | the depending project's `package.json` | same |
| Resolves during development to | the local source directory | the recorded resolution |
| At pack time | **rewritten** to a concrete version by `pnpm publish` | unchanged |
| Drives | order, affected sets, cache keys, version chaining | cache key only |

**Invariants**

- **E1** — An internal edge is declared exactly once, in one manifest (FR-024). It is *mirrored* by a
  TypeScript project reference, which is a build-ordering statement, not a second declaration of the
  dependency.
- **E2** — No published tarball contains the substring `workspace:` (FR-026, FR-027). Mechanically
  checked; not left to the packaging tool's good behaviour.
- **E3** — The graph is acyclic. Testable because two workspace projects now exist (FR-014, R8).
- **E4** — A project may have zero edges and must still work everywhere (FR-017) — `packages/theme`
  is the live case.

---

## Task

**Realised by**: `scripts` in each `package.json`, plus `targetDefaults` in `nx.json`

| Task | Command | Depends on | Cacheable | Outputs |
| ---- | ------- | ---------- | --------- | ------- |
| `build` | `tsc -b` | `^build` | yes | `dist/`, `*.tsbuildinfo` |
| `test` | `vitest run` | `^build` | yes | none |
| `typecheck` | `tsc -b --noEmit` | `^build` | yes | none |
| `lint` | `prettier --check .` | — | yes | none |

`^build` means "the same task in every project this one depends on, first" — the mechanism behind
FR-010.

**Invariants**

- **T1** — Every task declares its inputs. An input a task reads but does not declare produces a
  stale cache hit, which is a green build that means nothing (FR-019, and the spec's *undeclared
  input* edge case).
- **T2** — A task's cache key includes its dependencies' keys, so a change in `core` invalidates
  `cli` (FR-021).
- **T3** — A project without a task is skipped, not failed (FR-009) — `packages/theme` is the live
  case.

---

## Lockfile

**Realised by**: `pnpm-lock.yaml`, committed

**Invariants**

- **L1** — Installing at a given commit never modifies it. CI installs frozen; a diff is a failure
  naming the drift (FR-004, FR-006).
- **L2** — It pins the external edge, so an upstream publish cannot change a build here (FR-025).
- **L3** — Conflicts are resolved by re-resolving from manifests, never by hand-editing.

---

## Credential

Three distinct kinds. Conflating them is how a long-lived secret ends up where a run-scoped identity
would do.

| Kind | Held by | Scope | Used for |
| ---- | ------- | ----- | -------- |
| Contributor read | a developer's environment, as `NODE_AUTH_TOKEN` | classic PAT, `read:packages` | installing `@seeliang/*` |
| Pipeline read | the workflow run itself | `permissions: packages: read` | installing in CI |
| Pipeline write | the publish job only | `permissions: packages: write` | publishing |

**Invariants**

- **C1** — No credential appears in any committed file, ever (FR-034).
- **C2** — No long-lived secret exists for a purpose the run-scoped identity can serve (FR-033).
  Cross-repository read of the sample package is solved by a **settings grant** on that package
  (Manage Actions access → Add Repository), not by storing a PAT.
- **C3** — Only the publish job holds write (FR-030, FR-033).
- **C4** — An absent credential is reported as absent, distinguishably from unauthorized and from
  registry-unreachable (FR-003, FR-035).

---

## Release

**Realised by**: `nx.json` `release` config, `.github/workflows/release.yml`, git tags

| Setting | Value | Consequence |
| ------- | ----- | ----------- |
| `projectsRelationship` | `independent` | **load-bearing** — under `fixed`, SC-008 would pass while proving nothing about the graph |
| `version.updateDependents` | `always` | bumping `core` bumps `cli` (FR-028) |
| `version.preserveLocalDependencyProtocols` | `true` | `workspace:*` stays in the manifest; pnpm rewrites in the tarball |
| trigger | `workflow_dispatch` + version input | explicit, and not "every merge" (FR-032) |

**Invariants**

- **RL1** — A version number is spent once. Re-publishing it fails (FR-045).
- **RL2** — A partial failure reports exactly which packages published, and the remainder is
  resumable at the same version (FR-038). Atomicity across separate registry operations is not
  available and is not claimed.
- **RL3** — Every published artifact carries an attestation binding it to its commit and run
  (FR-037).

---

## State transitions

The only stateful object is a package version.

```
   authored ──pnpm pack──▶ archive ──attest──▶ signed archive
                  │                                  │
        FR-027 gate: no                       pnpm publish
        "workspace:" string                          │
                                                     ▼
                                                 published ──▶ spent
                                                                (FR-045: never reused)
```

`published → spent` is the transition worth naming, because it is the only irreversible one in the
feature. On this registry a version can be *deleted*, but its number can never be reused.
