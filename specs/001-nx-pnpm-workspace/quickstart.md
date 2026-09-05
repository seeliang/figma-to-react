# Quickstart: validating the workspace foundation

**Feature**: `001-nx-pnpm-workspace` · **Date**: 2026-09-05

Runnable validation for every success criterion in [spec.md](spec.md). Each section states what to
run and what proves it. Contracts are referenced, not repeated —
[workspace-commands](contracts/workspace-commands.md),
[project-manifest](contracts/project-manifest.md),
[published-package](contracts/published-package.md).

Run these in order; later sections assume earlier ones passed.

---

## 0. Prerequisites — before any of this works

Two are **settings, not code**, and neither can be done from a terminal in this repository. Both are
tasks in `tasks.md`.

| # | Prerequisite | Why |
| - | ------------ | --- |
| 1 | **`gh auth refresh -s workflow`** | The current token lacks the `workflow` scope, so a push containing `.github/workflows/*` is rejected (research R0). |
| 2 | **The sample package grants this repository Actions access** | Package settings → Manage Actions access → Add Repository. Without it, CI's run-scoped token cannot read a package in another repository, and the only alternative is the long-lived PAT that FR-033 forbids. |
| 3 | A classic PAT with `read:packages`, exported as `NODE_AUTH_TOKEN` | Fine-grained tokens do not work with GitHub Packages. |

Confirm 3 before going further:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $NODE_AUTH_TOKEN" \
  https://npm.pkg.github.com/@seeliang%2Fgithub-package-sample
# expect 200.  401 means the token is missing, fine-grained, or lacks read:packages.
```

---

## 1. Clone to green build — SC-001, SC-002

**SC-002 first**, because it is the one everyone skips and the one that costs a newcomer an hour:

```bash
git clone -b release https://github.com/seeliang/figma-to-react.git f2r && cd f2r
unset NODE_AUTH_TOKEN
pnpm install
```

✅ Fails naming `NODE_AUTH_TOKEN`, the token type required, and where to read more. A bare `401` is a
**failure of this criterion**, not a pass with rough edges.

```bash
export NODE_AUTH_TOKEN=<classic PAT>
time pnpm install          # SC-001: one credential setup...
time pnpm verify           # ...and two commands
```

✅ Green, under 15 minutes wall-clock from clone, reading only the README (FR-049).

**Version guard** — with a wrong package manager:

```bash
npm install                # expect refusal naming pnpm@11.25.0
```

---

## 2. The graph is real — SC-004, SC-005

The heart of the feature. Watch *which* projects run, not just that the command passes.

```bash
pnpm nx graph              # f2r-cli → f2r-core present; f2r-theme isolated  (FR-015)
```

```bash
git checkout -b probe
echo "// touch" >> ai-plugin/core/src/index.ts
pnpm nx affected -t build --base=release
```

✅ **SC-004** — exactly `f2r-core` and `f2r-cli` run. Zero others.

```bash
git checkout -- . && echo "// touch" >> ai-plugin/cli/src/index.ts
pnpm nx affected -t build --base=release
```

✅ **SC-005** — exactly one project runs. `f2r-core` does not.

```bash
git checkout -- .
```

**Ordering and the disconnected node:**

```bash
pnpm nx build @seeliang/f2r-cli    # core builds first (FR-010); theme untouched (FR-017)
```

**Cycle detection (FR-014):**

```bash
pnpm vitest run ai-plugin/cli/test/cycle-detection.test.ts
git status --porcelain             # must be empty — the test restores from the git index
```

✅ Exits non-zero naming both projects; the working tree is clean afterwards.

---

## 3. Caching — SC-003

```bash
pnpm nx reset
time pnpm verify           # cold
time pnpm verify           # warm
```

✅ **SC-003** — the second run is under 10% of the first.

```bash
echo "// touch" >> ai-plugin/core/src/index.ts
pnpm nx build @seeliang/f2r-cli    # cli re-executes: its key includes core's (FR-021)
git checkout -- .
pnpm nx build @seeliang/f2r-cli --skip-nx-cache   # forced re-execution (FR-022)
```

---

## 4. Reproducibility — SC-006

```bash
pnpm install --frozen-lockfile
git diff --exit-code pnpm-lock.yaml
```

✅ No diff. CI runs the same command, so drift fails the pipeline rather than landing silently
(FR-006).

---

## 5. The tarball — SC-007

**The clause that fails at a consumer's machine long after CI was green.**

```bash
node scripts/verify-no-workspace-refs.mjs
```

✅ Zero archives contain `workspace:`. Manual confirmation of what it checks:

```bash
cd ai-plugin/cli && pnpm pack --pack-destination /tmp && cd -
tar -xzOf /tmp/seeliang-f2r-cli-0.1.0.tgz package/package.json | grep f2r-core
# expect a concrete version, e.g. "0.1.0" — NEVER "workspace:*"
```

> Packing with `npm pack` instead would emit `workspace:*` verbatim and produce an archive nobody
> can install. That is the failure this check exists for, and why it is mechanical rather than a
> convention (FR-027).

---

## 6. Version chaining — SC-008

**Read this one carefully — it is the criterion most easily passed for the wrong reason.**

```bash
pnpm nx release version patch --projects=@seeliang/f2r-core --dry-run
```

✅ `f2r-core` bumps, **and `f2r-cli` bumps with it** (FR-028).

❌ If `f2r-theme` also bumps, `projectsRelationship` is still `fixed` — everything bumps together,
`f2r-cli` bumped for no reason connected to the graph, and **SC-008 is passing while proving
nothing**. See research R2. Fix `nx.json` before believing this section.

---

## 7. Pipeline — SC-014, SC-015

```bash
gh pr create --fill      # then watch the checks
```

✅ **SC-014** — install, build, test, lint, typecheck and the lockfile check all run; a failure in
any blocks merge (FR-031).

Deliberately break one to confirm the gate is real:

```bash
echo "const x: number = 'nope';" >> ai-plugin/core/src/index.ts   # then push
```

✅ Pipeline red, merge blocked. Revert after.

```bash
grep -rIn "ghp_\|github_pat_\|_authToken=[^$]" -- . ':!pnpm-lock.yaml'
```

✅ **SC-015** — no credential in the repository, and no long-lived secret where the run-scoped
identity suffices (FR-033: the sample package is reachable via the Actions-access grant, not a PAT).

```bash
pnpm publish --filter @seeliang/f2r-core     # from a laptop
```

✅ **SC-013** — refused (FR-030).

---

## 8. Release and consumer install — SC-009, SC-010, SC-016

The end-to-end proof. Trigger the release workflow (`workflow_dispatch`, version `0.1.0`).

✅ All three publish. On partial failure, the log names exactly which succeeded and the rest resume
at the same version with `--projects=<remaining>` (FR-038).

**Then leave the repository entirely** — a different machine, or at minimum a directory with no
relationship to it:

```bash
mkdir /tmp/consumer && cd /tmp/consumer && pnpm init
printf '@seeliang:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}\n' > .npmrc
pnpm add @seeliang/f2r-cli@0.1.0
node -e "import('@seeliang/f2r-cli').then(() => console.log('ok'))"
```

✅ **SC-009** — imports, with `@seeliang/f2r-core@0.1.0` and the sample package resolved
transitively. This single install proves the workspace rewrite, external transitive resolution and
consumer authentication at once; if any were broken, it fails here.

```bash
pnpm add @seeliang/f2r-theme@0.1.0
ls node_modules/@seeliang/f2r-theme
```

✅ **SC-010** — installs and resolves. It is **not** imported: it has no entry point at `0.1.0`
(FR-039b, FR-044).

```bash
gh attestation verify seeliang-f2r-cli-0.1.0.tgz --repo seeliang/figma-to-react
```

✅ **SC-016** — commit and workflow run verifiable without repository access.

```bash
# re-trigger the release at 0.1.0
```

✅ **FR-045** — fails. The version is spent.

---

## 9. Adding a project — SC-011, SC-012

```bash
mkdir -p ai-plugin/probe && cat > ai-plugin/probe/package.json <<'JSON'
{ "name": "@seeliang/f2r-probe", "version": "0.0.0", "private": true, "type": "module",
  "scripts": { "lint": "prettier --check ." } }
JSON
pnpm install && pnpm nx show projects
```

✅ **SC-012** — it appears with **zero** edits to any central list. If a step required editing one,
the workspace is misconfigured.

✅ **SC-011** — it answers `lint` like everything else, and is skipped by `build` without failing
the run (FR-009).

```bash
rm -rf ai-plugin/probe && pnpm install
pnpm verify              # still green; no stale reference to the removed project
```

---

## 10. Zero projects — SC-017

```bash
git stash push -u -m "sc017-empty-workspace" -- ai-plugin packages
pnpm build && pnpm test && pnpm lint && pnpm typecheck && echo "all exit 0"
git stash pop
```

✅ **SC-017** — every workspace-wide command succeeds with no projects, so adding the first is never
a special case (FR-048).

---

## Coverage

| Criterion | Section | | Criterion | Section |
| --------- | ------- |-| --------- | ------- |
| SC-001 | 1 | | SC-010 | 8 |
| SC-002 | 1 | | SC-011 | 9 |
| SC-003 | 3 | | SC-012 | 9 |
| SC-004 | 2 | | SC-013 | 7 |
| SC-005 | 2 | | SC-014 | 7 |
| SC-006 | 4 | | SC-015 | 7 |
| SC-007 | 5 | | SC-016 | 8 |
| SC-008 | 6 | | SC-017 | 10 |
| SC-009 | 8 | | | |

All 17 covered. Sections 1, 2, 5 and 6 are the ones worth running by hand at least once — they are
where a green result can mean the wrong thing.
