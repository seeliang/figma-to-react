# Phase 0 Research: Workspace foundation

**Feature**: `001-nx-pnpm-workspace` · **Date**: 2026-09-05 · **Spec**: [spec.md](spec.md)

Every open question the spec carried into planning is resolved below, plus three findings the spec
did not anticipate. Facts verified live are marked **✔ verified**; the command that verified them is
shown so the check can be repeated.

---

## R0 — Two projects share one repository, deliberately

**The arrangement.** `seeliang/figma-to-react` hosts **two unrelated histories**. `main` is the
original project; `release` / `theme` / `00N-*` are this one, and `figma-to-react-theme` is a
worktree checked out on the latter lineage.

```
$ git merge-base main release
fatal: (unrelated histories)
$ git symbolic-ref refs/remotes/origin/HEAD
refs/remotes/origin/main          # the OTHER project
```

**This is intentional and stays.** An earlier draft of this section read it as a defect and proposed
a separate repository; that was an inference dressed as a finding, and it was wrong. One repository,
two lineages, is the arrangement.

**What it does change** is narrow, and only one requirement is affected.

**FR-031 says "the default branch". For this project that is `release`, not GitHub's default.**
GitHub's default branch is `main` — the other project's. So:

| Concern | Resolution |
| ------- | ---------- |
| CI trigger (FR-031) | `on: pull_request: branches: [release]` and `push: branches: [release]`. Never `main` — a change here never reaches it. |
| Affected base (FR-014, FR-018, R7) | `--base=origin/release`. |
| Workflow files | For `pull_request`, GitHub reads the workflow from the **base** branch, so `verify.yml` must be merged to `release` before it gates anything. Expect the first PR after the merge to be the first one actually checked. |
| `repository` in each manifest | `git+https://github.com/seeliang/figma-to-react.git`, with a `directory` field naming the package path. GitHub Packages binds a package to a repository, and this is that repository. |
| Where packages appear (FR-032) | Under `seeliang/figma-to-react`, alongside anything the other lineage publishes. The `@seeliang/f2r-*` prefix is what keeps them distinguishable. |
| Attestations (FR-037) | `gh attestation verify <tarball> --repo seeliang/figma-to-react`. |
| Cross-repo read of the sample | Unchanged and still needed: `@seeliang/github-package-sample` lives in `seeliang/github-package`, so grant **`figma-to-react`** Actions access to that package (see R1). |

**No Actions conflict.** The other lineage carries no `.github/workflows`, so nothing this feature
adds can fire against it.

**One scope gap to fix before the pipeline lands.** The current `gh` token carries
`gist, read:org, repo` — **no `workflow` scope**, so a push containing `.github/workflows/*` is
rejected. Run `gh auth refresh -s workflow` before the task that adds the workflow files. Better
found now than at the first push of `verify.yml`.

## R1 — GitHub Packages requires authentication to install, even for public packages

**✔ Verified**, live, against the actual sample package:

```
$ curl -i https://npm.pkg.github.com/@seeliang%2Fgithub-package-sample
HTTP/2 401
{"error":"authentication token not provided"}

$ curl -o /dev/null -w '%{http_code}' https://registry.npmjs.org/nx     # control
200
```

GitHub's own documentation states it plainly: *"to pull a package, you must authenticate with a
personal access token or `GITHUB_TOKEN`, regardless of whether the package is public or private"* —
the Container registry is the sole exception, and this is the npm registry.

The spec's ⚠️ assumption is therefore **fact, not assumption**, and Story 5 has already paid for
itself before a line of code exists.

**Decisions.**

1. **Scope mapping is committed** (FR-002), in a root `.npmrc` that reads the token from the
   environment and never contains one:
   ```
   @seeliang:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```
   Only the `@seeliang` scope is redirected; everything else resolves from the default registry.
2. **Contributors** create a classic PAT with `read:packages` and export it as `NODE_AUTH_TOKEN`.
   GitHub Packages supports **classic** personal access tokens only — fine-grained tokens do not
   work — which the README must say, because the failure otherwise looks like a wrong password.
3. **The pipeline** uses its own run-scoped job identity (`GITHUB_TOKEN`) with
   `permissions: packages: read`, and `packages: write` only in the publish job (FR-033).
4. **FR-003 / SC-002** — a bare 401 does not name what is missing. A root `preinstall` script checks
   for `NODE_AUTH_TOKEN` and exits with the README anchor. Twelve lines, and it is the difference
   between a contributor's first five minutes and their first hour.

**Cross-repository read — the one wrinkle.** `@seeliang/github-package-sample` lives in
`seeliang/github-package`, a *different* repository, and a run-scoped `GITHUB_TOKEN` is scoped to
the repository that owns the workflow. The fix is a one-time setting, not a credential: in the
package's settings, **Manage Actions access → Add Repository → `figma-to-react`**. Doing it
this way is what lets FR-033 stand; the alternative is a long-lived PAT stored as a repository
secret, which FR-033 exists to forbid.

---

## R2 — `nx release` + pnpm: the workspace-protocol rewrite is handled, but only because of pnpm

**The trap the spec named (FR-026/FR-027) is real.** `nx release publish` uses **npm** under the
hood by default, and `npm` does not understand pnpm's `workspace:` protocol — it ships
`"@seeliang/f2r-core": "workspace:*"` verbatim into the tarball, producing an archive no consumer
can install.

**What actually saves us**: Nx detects the workspace's package manager and, for pnpm, *"invokes
`pnpm publish` … instead of `npm publish` behind the scenes during publishing"* — and pnpm swaps
`workspace:*` for the concrete version at pack time. Nx's own documentation is explicit that *"pnpm
and bun are the only package managers that provide a publish command that both supports dynamically
swapping the `file:` and `workspace:*` references with the actual version number at publish time."*

**Decisions.**

| Setting | Value | Why |
| ------- | ----- | --- |
| `release.version.preserveLocalDependencyProtocols` | `true` (Nx ≥21 default) | keeps `workspace:*` in the committed manifest, so development resolves to local source (FR-024); pnpm rewrites only in the tarball |
| `release.projectsRelationship` | `"independent"` | **load-bearing** — see below |
| `release.version.updateDependents` | `"always"` (Nx ≥22 default) | bumping `core` bumps `cli` and rewrites its reference (FR-028) |

**Why `independent` is load-bearing.** Under *fixed* versioning every package bumps together, so
`cli` would bump whether or not it depends on `core` — and **SC-008 would be vacuously true**,
proving nothing about the graph. Independent versioning is the only configuration under which
SC-008 is a real test. This is easy to get wrong and is the single most important line in `nx.json`.

**FR-027 is still built, and deliberately does not trust the above.** A script packs each
publishable project and fails if any resulting `package.json` contains the string `workspace:`. It
passes trivially today. It exists for the day someone changes the package manager, takes an Nx major,
or adds a publish path that bypasses `nx release` — which is exactly when the tarball would
otherwise reach a consumer broken. Mechanical check, not a convention (FR-027 says so).

**Known Nx defect to watch**: nrwl/nx#27823 — under independent versioning, dependents could be
bumped once *per updated dependency* rather than once. With one dependent and one dependency it
cannot bite; noted so the second edge does not surprise anyone.

---

## R3 — Provenance on GitHub Packages needs a different mechanism (FR-037)

npm's `--provenance` flag targets the public npm registry's sigstore flow. GitHub Packages does not
consume it, so the flag is not the answer here.

**Decision**: `actions/attest-build-provenance` over the packed tarballs in the publish job, with
`permissions: id-token: write, attestations: write`. It produces a signed statement binding each
artifact to the commit and the workflow run, stored on the repository and verifiable with
`gh attestation verify <tarball> --repo seeliang/figma-to-react`.

**Honest limit, recorded rather than glossed**: this is weaker than npm provenance in one respect —
the consumer must fetch the tarball and run a CLI, rather than seeing a badge on a registry page. It
satisfies FR-037's stated outcome ("a verifiable, consumer-checkable link to the commit and pipeline
run") but not the convenience npm provenance offers. Cost is roughly one workflow step, so the
FR stands as written; if it fights the publish job, *Complexity Tracking* is where it goes, not the
bin.

---

## R4 — Partial release (FR-038): reporting and resumption, not atomicity

Three packages publish as three separate registry operations. No npm-compatible registry offers a
transaction across them, so **atomicity is not available** and pretending otherwise would be the
dilution the constitution warns about.

**Decision**: *report and resume*.

1. The release job runs `nx release publish --dry-run` first; a failure there costs nothing.
2. The real publish reports per-project success or failure — Nx does this natively.
3. On partial failure, the remaining packages are published with
   `nx release publish --projects=<remaining>` at the same version. Already-published packages fail
   loudly if retried, which is FR-045 working as intended, not an obstacle.
4. The README records the resume command, because a partial failure is exactly when nobody wants to
   work it out from first principles.

---

## R5 — Toolchain versions

All **✔ verified** against the live registries on 2026-09-05.

| Tool | Version | Note |
| ---- | ------- | ---- |
| Node | `>=26` in `engines`, CI on **26** | Chosen deliberately — see below. |
| pnpm | **11.25.0**, pinned in `packageManager` | the `latest` tag. `latest-12` (12.3.4) exists but is not `latest`; a build tool is not where to be early. |
| Nx | **23.2.0** | `updateDependents: "always"` is the default from 22 — R2 depends on this. |
| TypeScript | **7.0.2** | see below |
| Vitest | **5.0.0** | matches the sibling's choice of runner, two majors on |

**Node 26 — the tradeoff, stated once.** Verified from the Node release index: 26.8.1 (2026-08-26)
is **Current**, not LTS; 24 *Krypton* is the active LTS and 22 *Jod* is in maintenance. Node 26 is
an even-numbered line, so it enters LTS in late October 2026 — roughly seven weeks out. Adopting it
now means running a non-LTS runtime for those weeks, and it is the right call for the same reason
TypeScript 7 is: three near-empty packages is the cheapest moment this project will ever have to
absorb a runtime surprise, and by the time there is real code the line will be LTS.

The one place it is not free is `engines`. `">=26"` in a **published** package excludes consumers on
Node 24 LTS. It is harmless today — `f2r-core` and `f2r-cli` are developer tooling with no runtime
behaviour, and `f2r-theme` ships CSS — but the workspace's development requirement and a published
package's compatibility range are different questions with the same field name. When these packages
have runtime code worth being compatible about, the published `engines` should be relaxed
independently of what CI builds on. Recorded so that is a decision rather than an oversight.

**TypeScript 7 — a considered risk.** `latest` is 7.0.2, the Go-native compiler; the 5.x line is
finished. `tsc --build`, `composite` and project references are supported, and 7 adds `--builders`
for parallel project-reference builds — the exact workload this workspace has. It is new, and this
workspace is three near-empty packages, which makes it the cheapest possible moment to find out. If
`tsc -b` misbehaves, the fallback is TypeScript 5.9 and the change is one line in one place, because
**no Nx executor wraps the compiler** — see R6.

---

## R6 — Build, test and lint: native first (constitution P1)

**Build**: `"build": "tsc -b"` as a plain npm script in each package, with TypeScript project
references expressing the same edge the manifest does. Nx runs the script; it does not replace it.
This is what P1 demands — *"use native platform configuration first"* — and it is why R5's
TypeScript fallback is one line. No `@nx/js`, no executors, no plugin inference doing something a
reader cannot see in the package's own `scripts`.

**Test**: Vitest, one config at the root, `"test": "vitest run"` per package.

**Lint — the interesting one.** FR-007 requires a lint task. The obvious move is ESLint; **P1
forbids it today**: *"a dependency enters only when it removes a demonstrated project-specific
problem."* No such problem has been demonstrated — there is almost no code yet.

**Decision**: `"lint": "prettier --check ."`. It is a real check that fails on real violations, it
matches the sibling repository's only formatting tool, and it costs one dependency instead of a
config ecosystem. When a lint rule earns its place by catching something Prettier cannot, ESLint
enters then, with the problem written down. Recorded here so the choice reads as deliberate rather
than forgotten.

---

## R7 — Affected runs need history the default checkout does not fetch

`actions/checkout` defaults to a shallow, single-branch clone; `nx affected` then has no base
revision, and FR-023's failure mode is *silently verifying nothing and reporting success* — the
worst kind of green.

**Decision**: `fetch-depth: 0` on checkout, and an explicit `--base=origin/release` (R0 — `main` belongs to the other lineage). Nx surfaces a
missing base as an error, which is FR-023 satisfied; a task in `tasks.md` will assert that behaviour
rather than assume it.

---

## R8 — Cycle detection (FR-014) can be tested without a fixture

A cycle cannot be committed, so the check must create one. A test writes a reverse dependency into
`ai-plugin/core/package.json`, asserts that an Nx command exits non-zero naming both projects, and
restores the file **from the git index** in `finally` — `git checkout -- <path>` restores
deterministically even if the assertion throws.

Roughly fifteen lines, it exercises the real workspace rather than a synthetic copy of it, and CI's
working-tree-clean assertion catches it if restoration ever fails. This is what iteration 3's
*Known gap* was blocked on and what Option A unblocked.

---

## R9 — Release trigger (FR-032)

**Decision**: `workflow_dispatch` with a version input. Explicit, unambiguously not "every merge",
and it needs no commit-message convention while there are no commits to draw one from. Conventional
commits or version plans can replace it once release cadence exists; that is a later feature and
`nx.json` will not need restructuring for it.

---

## Summary of decisions

| ID | Decision |
| -- | -------- |
| R0 | One repository, two lineages — intentional. FR-031's "default branch" means **`release`**; CI and `--base` target it, not `main`. `gh auth refresh -s workflow` needed before workflow files are pushed. |
| R1 | Committed `.npmrc` scope map + env token; classic PAT for contributors; `GITHUB_TOKEN` in CI; grant the sample package Actions access to this repo; `preinstall` guard for FR-003 |
| R2 | `preserveLocalDependencyProtocols: true`, `projectsRelationship: "independent"`, `updateDependents: "always"`; plus an independent mechanical no-`workspace:` check |
| R3 | `actions/attest-build-provenance` over the tarballs, with its limit recorded |
| R4 | Report-and-resume, not atomicity; dry-run first |
| R5 | Node ≥26 (CI 26), pnpm 11.25.0, Nx 23.2.0, TypeScript 7.0.2, Vitest 5.0.0 |
| R6 | `tsc -b` scripts, Vitest, `prettier --check` as lint; no ESLint until a problem is demonstrated |
| R7 | `fetch-depth: 0` and explicit `--base=origin/release` |
| R8 | Cycle test mutates and restores from the git index |
| R9 | `workflow_dispatch` with a version input |

**Sources**: [GitHub Packages permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages) ·
[working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) ·
[Nx — updating version references](https://nx.dev/docs/guides/nx-release/updating-version-references) ·
[Nx — update dependents](https://nx.dev/docs/guides/nx-release/update-dependents) ·
[Nx — release projects independently](https://nx.dev/docs/guides/nx-release/release-projects-independently) ·
[nrwl/nx#27823](https://github.com/nrwl/nx/issues/27823) ·
[actions/attest-build-provenance](https://github.com/actions/attest-build-provenance) ·
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/) ·
[pnpm workspaces](https://pnpm.io/workspaces)
