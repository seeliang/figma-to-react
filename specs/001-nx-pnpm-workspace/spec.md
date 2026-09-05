# Feature Specification: Workspace foundation — one install, a real graph, three published 0.1.0s

**Feature Branch**: `001-nx-pnpm-workspace`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "setup NX pnpm for the project"

**Clarified**: 2026-09-05 — the deliverable is three real packages, published at `0.1.0` to GitHub
Packages by a GitHub Actions pipeline, wired so the workspace dependency graph is exercised by the
repository itself rather than described in principle.

## User Scenarios & Testing *(mandatory)*

The people this feature serves are **contributors** (anyone working in this repository), the
**pipeline** (the unattended process that verifies and publishes), and **consumers** (anyone
installing a published package). The repository today holds documentation only; every project that
will exist is added on top of what this feature establishes.

This feature is a **walking skeleton**: it proves the whole path — clone, authenticate, install,
build, verify, version, publish, install from the registry — on packages that do almost nothing.
What they eventually contain is a later feature. That the path works is this one.

### The shape being built

```
  ┌──────────────────────── THE WORKSPACE ────────────────────────┐
  │                                                               │
  │   ai-plugin/cli                     packages/theme            │
  │   @seeliang/f2r-cli                 @seeliang/f2r-theme       │
  │        │                                                      │
  │        │ workspace:*   ← a protocol, rewritten at pack time   │
  │        ▼                                                      │
  │   ai-plugin/core                                              │
  │   @seeliang/f2r-core                                          │
  │        │                                                      │
  └────────┼──────────────────────────────────────────────────────┘
           │ "^x.y.z"      ← an ordinary version range
           ▼
   @seeliang/github-package-sample          [ external, already published ]
```

Three nodes, one **internal** edge, one **external** edge. The internal edge is what makes execution
order, transitive affected sets, version chaining and pack-time rewriting testable against this
repository instead of described and left unverified. The external edge proves the registry
round-trip. `packages/theme` is deliberately disconnected: the generator does not consume the design
system it writes, and constitution **P6** requires the graph to reflect the real dependency
direction rather than a convenient one.

### User Story 1 — A contributor gets from clone to green build (Priority: P1)

Someone clones the repository for the first time. They follow the README to create the registry
credential the repository needs, run one command to install everything, and one command per task
kind — build, test, lint, typecheck — that runs that task across every project. They never install
per project, never learn a bespoke command for a particular project, and never need to know which
project depends on which for the build to come out in the right order.

**Why this priority**: Nothing else in this feature is reachable without it. If a newcomer cannot
reach a green build from a clean clone, no later capability — caching, affected runs, releases — can
be demonstrated or trusted.

**Independent Test**: Clone into an empty directory on a machine that has never built this
repository, follow the README, and reach a passing full build and test run.

**Acceptance Scenarios**:

1. **Given** a clean clone with no installed dependencies and a configured registry credential,
   **When** the contributor runs the single documented install command, **Then** all three projects'
   dependencies are installed and no further per-project install is required.
2. **Given** a clean clone with **no** registry credential configured, **When** the contributor runs
   the install command, **Then** the failure names the missing credential and points at the README
   section that explains how to create it — not an unexplained authorization error.
3. **Given** an installed repository, **When** the contributor runs the workspace-wide build
   command, **Then** every project that defines a build is built, and `ai-plugin/core` is built
   before `ai-plugin/cli`.
4. **Given** an installed repository, **When** the contributor builds `ai-plugin/cli` alone,
   **Then** `ai-plugin/core` is built first and `packages/theme` is not built at all.
5. **Given** a project that does not define a given task, **When** the workspace-wide command for
   that task runs, **Then** the run skips that project and still reports success.
6. **Given** a contributor using a package manager or runtime version other than the one the
   repository declares, **When** they attempt to install, **Then** they are told which version is
   required rather than proceeding with a silently different dependency resolution.

---

### User Story 2 — The graph is real, and the repository proves it (Priority: P2)

The workspace contains two projects with a genuine dependency between them. That single edge is what
turns four otherwise-theoretical properties into things CI checks on every run: build order,
transitive affected sets, version chaining, and the rewriting of workspace-local references when a
package is packed.

**Why this priority**: These are continuous properties, not one-time facts. They break when the
package manager version changes, when the build tool takes a major, and — most expensively — when
the tarball with an unrewritten `workspace:*` in it reaches a consumer. A check that exists only
while someone is watching is not a check.

**Independent Test**: Change a file in `ai-plugin/core` and confirm `ai-plugin/cli` is rebuilt and
`packages/theme` is not. Pack `ai-plugin/cli` and confirm its dependency on `ai-plugin/core` is a
concrete version, not a workspace reference.

**Acceptance Scenarios**:

1. **Given** the workspace, **When** the dependency graph is inspected, **Then** the edge from
   `ai-plugin/cli` to `ai-plugin/core` is present, and it was declared only once — in
   `ai-plugin/cli`'s own manifest.
2. **Given** a change to a file in `ai-plugin/core`, **When** the affected-only run is invoked,
   **Then** both `ai-plugin/core` and `ai-plugin/cli` are verified.
3. **Given** a change to a file in `ai-plugin/cli`, **When** the affected-only run is invoked,
   **Then** `ai-plugin/core` is not verified.
4. **Given** a distributable archive of `ai-plugin/cli`, **When** its manifest is inspected,
   **Then** its dependency on `@seeliang/f2r-core` is a concrete released version and contains no
   workspace-local reference marker.
5. **Given** an archive that does contain a workspace-local reference marker, **When** the release
   runs, **Then** it fails rather than publishing something that cannot be installed.
6. **Given** `ai-plugin/core`'s version is bumped, **When** the release process runs, **Then**
   `ai-plugin/cli` is bumped too and its recorded range on `@seeliang/f2r-core` is updated to match.
7. **Given** a deliberately introduced reverse dependency from `ai-plugin/core` back to
   `ai-plugin/cli`, **When** any workspace command runs, **Then** the cycle is reported as an error
   naming both projects, rather than the command hanging or picking an order.

---

### User Story 3 — Three packages reach consumers at 0.1.0 (Priority: P2)

Each package is versioned, verified, published by the pipeline, and installed from the registry into
an unrelated project. They export almost nothing — that is the point. What is being proved is that a
version can travel from this repository to a consumer's `node_modules`, with its own dependencies
intact, without a human running a publish command.

**Why this priority**: An unproven release path is the most expensive kind of debt, because it fails
for the first time on the day the first real release matters. Proving it while the payload is empty
costs nothing, and every later release rides the same rails.

**Independent Test**: On a machine with no access to this repository, create an empty project,
authenticate to the registry, install `@seeliang/f2r-cli@0.1.0`, and import it without error — which
succeeds only if `@seeliang/f2r-core` resolves transitively at a real version.

**Acceptance Scenarios**:

1. **Given** the three packages at version `0.1.0`, **When** the release is triggered in the
   pipeline, **Then** all three are published to the registry under the `@seeliang` scope.
2. **Given** the published `@seeliang/f2r-cli@0.1.0`, **When** it is installed into an empty project
   outside this repository by an authenticated consumer, **Then** `@seeliang/f2r-core@0.1.0` and
   `@seeliang/github-package-sample` both resolve transitively and the package imports without
   error.
3. **Given** the published `@seeliang/f2r-theme@0.1.0`, **When** it is installed the same way,
   **Then** it imports without error.
4. **Given** any published `0.1.0`, **When** a consumer inspects its origin, **Then** the commit and
   pipeline run that produced it are verifiable without access to this repository.
5. **Given** a contributor's machine, **When** a publish is attempted from it, **Then** it is
   refused.
6. **Given** `0.1.0` is already published, **When** the release is triggered again without a version
   change, **Then** it fails rather than silently doing nothing or overwriting.

---

### User Story 4 — Every proposed change is verified before it lands (Priority: P2)

A contributor opens a change. The pipeline installs, builds, tests, lints and typechecks it, and
confirms the recorded dependency resolution did not drift. A change that fails any of these cannot
be merged.

**Why this priority**: It is what makes Story 1's green build a property of the repository rather
than of one contributor's laptop, and it is what makes Story 2's four checks continuous rather than
occasional. It shares P2 with Stories 2 and 3 because the same pipeline serves all of them.

**Independent Test**: Open a change that deliberately fails one task — a type error, say — and
confirm the pipeline reports the failure and blocks the merge. Then fix it and confirm it passes.

**Acceptance Scenarios**:

1. **Given** a change proposed to the default branch, **When** the pipeline runs, **Then** it
   installs, builds, tests, lints and typechecks, and reports one clear pass or fail.
2. **Given** a change that fails any of those tasks, **When** the pipeline finishes, **Then** the
   change cannot be merged.
3. **Given** a change whose install would alter the recorded dependency resolution, **When** the
   pipeline runs, **Then** it fails, naming the drift.
4. **Given** the pipeline's checkout, **When** a change-scoped run needs a base revision to compare
   against, **Then** the base revision is present.
5. **Given** the pipeline needs to install a scoped dependency from the registry, **When** it runs,
   **Then** it authenticates using its own run-scoped identity, with no long-lived credential stored
   for a purpose that identity can serve.

---

### User Story 5 — The registry round-trip is proven from both ends (Priority: P3)

Before this repository publishes anything to the `@seeliang` scope, it consumes something from it.
`ai-plugin/cli` declares a dependency on the already-published `@seeliang/github-package-sample`, so
installing it exercises the exact registry mapping, credential and scope resolution that a consumer
of `@seeliang/f2r-cli` will later hit.

**Why this priority**: It is the cheapest possible test of the half of the round-trip that is
usually discovered last — the consumer's install. If authenticating to this registry is awkward, it
is far better to find out on a contributor's first install than in a consumer's first bug report. It
sits at P3 rather than P2 only because Story 3 subsumes its final proof; its value is that it lands
*earlier*, before anything has been published.

**Independent Test**: In a clean clone, configure the credential, install, and confirm the sample
package resolves from the registry. No publishing required.

**Acceptance Scenarios**:

1. **Given** a clean clone and a configured credential, **When** the install command runs, **Then**
   `@seeliang/github-package-sample` resolves from the registry and installs.
2. **Given** the installed workspace, **When** `ai-plugin/cli` is built, **Then** it references the
   sample package from its own source, so the dependency is real rather than declared and unused.
3. **Given** the pipeline, **When** it installs, **Then** the sample package resolves there by the
   same version-controlled configuration a contributor uses — not a pipeline-only special case.
4. **Given** the recorded dependency resolution, **When** a new version of the sample package is
   published upstream, **Then** builds here are unaffected until the resolution is deliberately
   updated.

---

### User Story 6 — Feedback scales with the size of the change (Priority: P3)

Running the same verification twice with nothing changed in between returns the previous result
instead of recomputing it.

**Why this priority**: Together with Story 2's affected sets, this is the reason a workspace exists
rather than a folder of unrelated projects. It does not block a green build or a release, but
without it the repository gets slower with every project added, and contributors start skipping
verification.

**Independent Test**: Run the full verification twice with no edits and confirm nothing re-executes
the second time; change a declared input and confirm the affected task does.

**Acceptance Scenarios**:

1. **Given** a task that has already run with the same inputs, **When** it is invoked again,
   **Then** its recorded result is reused and the task does not re-execute.
2. **Given** a cached task result, **When** any declared input of that task changes, **Then** the
   cached result is not reused and the task re-executes.
3. **Given** a cached result for `ai-plugin/cli`, **When** a file in `ai-plugin/core` changes,
   **Then** `ai-plugin/cli`'s cached result is not reused.
4. **Given** a contributor who suspects a stale result, **When** they invoke the run with caching
   disabled or clear the cache, **Then** the task re-executes from scratch.
5. **Given** a change set compared against a base revision that is not present locally, **When** the
   affected-only run is invoked, **Then** it reports the missing base rather than silently
   verifying nothing and reporting success.

---

### User Story 7 — Adding a project costs one directory (Priority: P4)

A contributor adds a new project. They create its directory with its own manifest and task
definitions, and the workspace-wide commands pick it up.

**Why this priority**: Every project after the third depends on this being cheap. It is last because
the first three are added by hand as part of this feature, but it is the difference between a
workspace that stays coherent and one that accretes special cases.

**Independent Test**: Add a minimal new project in a recognised location, run the workspace-wide
build, and confirm it participates — with no edit to any central list of projects.

**Acceptance Scenarios**:

1. **Given** a new project directory in a recognised workspace location, **When** the workspace-wide
   commands run, **Then** the new project participates without any central registry being edited.
2. **Given** the new project declares a dependency on an existing project, **When** the dependency
   graph is inspected, **Then** the new edge appears without being declared a second time anywhere
   outside the project's own manifest.
3. **Given** a project is renamed or removed, **When** the workspace-wide commands run, **Then**
   they succeed and no reference to the old name remains in workspace configuration.

---

### Edge Cases

- **No credential.** A contributor who has not created a registry token, and a pipeline whose
  identity lacks read access, must both fail with a message naming what is missing.
- **A read-only credential at publish time**, or a write credential that has expired: the publish
  step must say which permission is absent.
- **A dependency cycle.** Constructible now that two workspace projects exist; must be reported as
  an error naming both projects, not resolved arbitrarily or hung on.
- **A disconnected node.** `packages/theme` depends on nothing in the workspace and nothing depends
  on it. Workspace-wide commands, affected runs and versioning must all handle it correctly rather
  than assuming every project has an edge.
- **An undeclared input.** A task whose real behaviour depends on something not declared as an input
  — an environment variable, a network fetch, the wall clock — will return a stale cached success.
  The workspace must make a task's inputs explicit so this is a visible mistake in a project's
  configuration rather than an invisible one.
- **The wrong package manager.** Packing with a tool that does not understand the workspace-local
  reference protocol produces an archive that cannot be installed, and does so silently. This is the
  single failure mode most likely to reach a consumer, and it must be caught mechanically rather
  than documented.
- **A shallow clone.** The pipeline may check out without full history, leaving the affected-only
  comparison without a base revision to compare against.
- **A leftover cache.** A result cached before a project was renamed or its configuration changed
  must not be reused afterwards.
- **A partial release.** If publishing three packages and one fails midway, the state must be
  recoverable: either the release is atomic, or the pipeline reports exactly which packages were
  published so the rest can be completed without re-publishing a spent version.
- **Two contributors, one lockfile.** Concurrent dependency changes on separate branches produce a
  lockfile conflict; resolution must be by re-resolving from the manifests, never by hand-editing
  the lockfile.
- **A repeated version.** Triggering a release for a version already published must fail loudly; the
  registry will refuse it, and the pipeline must not report success anyway.
- **A registry that is unreachable.** Install and publish must distinguish "cannot reach the
  registry" from "not authorized" and from "no such package".

## Requirements *(mandatory)*

### Functional Requirements

**Installation and reproducibility**

- **FR-001**: A single documented command MUST install the dependencies of every project in the
  repository from a clean clone, with no per-project installation step.
- **FR-002**: The repository MUST map the `@seeliang` scope to the registry that serves it, in
  version-controlled configuration, so no contributor has to configure it by hand.
- **FR-003**: An install that fails for want of a registry credential MUST report that specifically,
  naming the credential and the README section that explains how to create it.
- **FR-004**: Dependency resolution MUST be reproducible: the same commit MUST resolve to identical
  dependency versions on every contributor machine and in the pipeline, including dependencies
  fetched from the `@seeliang` scope.
- **FR-005**: The repository MUST declare the runtime version range it supports and the exact
  package manager version it is built with, and a mismatch MUST surface as a message naming the
  required version rather than an install that silently proceeds.
- **FR-006**: An install that would change the recorded resolution MUST fail in the pipeline, so a
  change to resolved dependencies is always a reviewed change rather than a side effect.

**Uniform tasks**

- **FR-007**: The repository MUST expose one command per task kind — at minimum build, test, lint
  and typecheck — that runs that task across every project defining it, without the caller naming
  projects.
- **FR-008**: The same task kinds MUST be invocable for a single named project.
- **FR-009**: A project that does not define a given task MUST be skipped by the workspace-wide
  command without failing the run.
- **FR-010**: Task execution order MUST follow the dependency direction between projects: a
  project's prerequisites MUST complete before it runs.

**The dependency graph**

- **FR-011**: The dependency direction MUST be derived from each project's own declared
  dependencies, not from a separately maintained list that could disagree with them.
- **FR-012**: The workspace MUST contain at least one dependency edge between two of its own
  projects, so that ordering, affected sets, chaining and pack-time rewriting are exercised by this
  repository rather than asserted about it.
- **FR-013**: Every declared edge MUST reflect a real dependency. A dependency MUST NOT be declared
  for the purpose of producing an edge. *(Constitution P6.)*
- **FR-014**: A cycle in the dependency graph MUST be reported as an error identifying the projects
  involved.
- **FR-015**: The graph MUST be inspectable by a contributor, listing projects and the edges between
  them.
- **FR-016**: A project added in a recognised workspace location MUST be included in workspace-wide
  commands and in the graph without any central registry being edited.
- **FR-017**: A project with no edges MUST be handled correctly by every workspace-wide command,
  affected run and version operation.

**Change-scoped and cached execution**

- **FR-018**: The workspace MUST be able to restrict a run to the projects affected by a change set,
  determined relative to a named base revision.
- **FR-019**: "Affected" MUST include the changed projects and everything that depends on them,
  transitively.
- **FR-020**: A task invoked with inputs identical to a previous run MUST reuse the previous result
  instead of re-executing.
- **FR-021**: Reuse MUST be keyed on inputs each project declares, and a project's key MUST include
  its dependencies, so that changing a dependency invalidates its dependents' stored results.
- **FR-022**: Contributors MUST be able to force a task to re-execute and to discard stored results.
- **FR-023**: When the base revision for a change-scoped run is unavailable, the run MUST report
  that rather than resolving to an empty set of projects and reporting success.

**Dependencies and distribution**

- **FR-024**: A dependency between two projects in this repository MUST be declared once, in the
  depending project's manifest, and MUST resolve to the local source during development.
- **FR-025**: An external dependency MUST be pinned by the recorded resolution, so a version
  published upstream cannot alter a build here without a reviewed change.
- **FR-026**: A distributable archive MUST contain no workspace-local dependency reference: each
  MUST be rewritten to a concrete released version range before distribution.
- **FR-027**: Producing or publishing an archive that still contains a workspace-local reference
  MUST fail. This MUST be checked mechanically, not left to the choice of packaging tool.
- **FR-028**: A version bump MUST propagate along the dependency graph: bumping a project bumps
  every project that depends on it and updates the recorded range.
- **FR-029**: Version and release history MUST be derivable from the repository, not from a
  contributor's local state.

**The pipeline**

- **FR-030**: Publishing MUST be restricted to the pipeline; a publish initiated from a contributor
  machine MUST be refused. *(Constitution P6.)*
- **FR-031**: The pipeline MUST run install, build, test, lint, typecheck and the reproducibility
  check of FR-006 on every change proposed to the default branch, and a failure in any of them MUST
  prevent the change from merging.
- **FR-032**: Publication MUST be triggered by an explicit release action, not by every merge to the
  default branch.
- **FR-033**: The pipeline MUST authenticate to the registry using its own run-scoped identity, with
  the narrowest permissions the job needs — read to install, write only in the publish job. No
  long-lived credential may be stored for a purpose the run-scoped identity can serve.
- **FR-034**: No credential may be committed to the repository, in any form, at any time.
- **FR-035**: A step that cannot find or cannot use its credential MUST fail with a message
  distinguishing "absent", "not authorized" and "registry unreachable".
- **FR-036**: The pipeline MUST check out enough history for the change-scoped run of FR-018 to
  resolve its base revision.
- **FR-037**: A published artifact MUST carry a verifiable, consumer-checkable link to the commit
  and pipeline run that produced it. *(Constitution P6 — closes one of its `NOT BUILT` checks.)*
- **FR-038**: A release that publishes several packages MUST either succeed for all of them or
  report exactly which succeeded, so a partial failure can be completed without re-publishing a
  version already spent.

**The first packages**

- **FR-039**: The feature MUST deliver three packages, holding as little content as a valid
  published package permits: `packages/theme` → `@seeliang/f2r-theme`, `ai-plugin/core` →
  `@seeliang/f2r-core`, and `ai-plugin/cli` → `@seeliang/f2r-cli`.
- **FR-039a**: `ai-plugin/core` and `ai-plugin/cli` MUST each define all four task kinds of FR-007.
- **FR-039b**: `packages/theme` MUST consist of a manifest and nothing else, and MUST define no
  tasks. Its real content — `tokens.css` and its siblings — is a generated artifact that no
  generator yet exists to produce, and constitution **P4** forbids authoring one by hand under
  `packages/*/src/`. Hand-writing a placeholder entry point would create exactly the file the first
  generation run deletes (**P3**). It therefore also serves as the repository's live case for FR-009
  (a project defining no task is skipped) and FR-017 (a project with no edges).
- **FR-040**: `ai-plugin/cli` MUST depend on `ai-plugin/core` through a workspace-local reference,
  and MUST use it from its own source, so the edge is real rather than declared and unused.
- **FR-041**: `ai-plugin/cli` MUST depend on the already-published
  `@seeliang/github-package-sample` and MUST use it from its own source.
- **FR-042**: All three packages MUST be published at version `0.1.0`.
- **FR-043**: Installing `@seeliang/f2r-cli@0.1.0` into an empty project outside this repository, as
  an authenticated consumer, MUST transitively resolve `@seeliang/f2r-core@0.1.0` and
  `@seeliang/github-package-sample`, and MUST import without error.
- **FR-044**: Installing `@seeliang/f2r-theme@0.1.0` the same way MUST place a resolvable package in
  the consumer's dependency tree. It has no entry point to import at `0.1.0` — see FR-039b — so what
  is verified is that it installs and resolves, not that it executes.
- **FR-045**: Re-triggering a release for a version already published MUST fail rather than report
  success.
- **FR-046**: The README MUST state what a consumer needs in order to install these packages —
  including any credential the registry requires — before the first release is triggered.

**Repository hygiene**

- **FR-047**: Machine-local artifacts — installed dependencies, stored task results, build output —
  MUST be excluded from version control.
- **FR-048**: Workspace-wide commands MUST succeed on a repository containing no projects, so the
  workspace is never in a state where adding the first project is a special case.
- **FR-049**: The README MUST document the credential setup, the install command and every
  workspace-wide task command, and MUST be the only thing a contributor needs to read to reach a
  green build.

### Key Entities

- **Workspace**: the repository as a single unit of installation, verification and release. Owns the
  set of recognised locations where projects may live — currently `packages/` and `ai-plugin/`.
- **Project**: a directory with its own manifest, its own declared dependencies, and its own task
  definitions. The unit of caching, of affected-detection, of versioning and of publication.
- **Task**: a named unit of work a project can perform — build, test, lint, typecheck. Has declared
  inputs and, where it produces files, declared outputs.
- **Internal edge**: a dependency from one workspace project to another, declared as a
  workspace-local reference. Drives ordering, affected sets, cache invalidation and version
  chaining, and must be rewritten to a concrete version at pack time.
- **External edge**: a dependency on a package outside the workspace, declared as a version range
  and pinned by the recorded resolution. A leaf — it feeds the cache key and nothing else.
- **Lockfile**: the single recorded resolution of every dependency for the whole workspace,
  including those fetched from the `@seeliang` scope.
- **Stored result**: the recorded outcome of a task for a given set of inputs, reusable in place of
  re-execution.
- **Registry**: the service hosting the `@seeliang` scope. This repository is both a consumer of it
  and a publisher to it.
- **Credential**: what authorizes a registry operation. Distinct kinds: a contributor's read
  credential, the pipeline's run-scoped read credential, and the pipeline's write credential. Only
  the last may publish.
- **Pipeline**: the unattended process that verifies every proposed change and is the only thing
  permitted to publish.
- **Release**: a versioned publication of one or more projects, produced by the pipeline, traceable
  to the commit that produced it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor who has never built this repository reaches a passing full build and
  test run in under 15 minutes of wall-clock time, reading only the README — one credential setup
  followed by two commands.
- **SC-002**: A contributor who skips the credential setup learns exactly what is missing on their
  first attempt, without reading anything but the error.
- **SC-003**: A full verification run repeated immediately with no changes completes in under 10% of
  the first run's duration.
- **SC-004**: A change confined to `ai-plugin/core` causes exactly two projects to be verified —
  `ai-plugin/core` and `ai-plugin/cli` — and zero others.
- **SC-005**: A change confined to `ai-plugin/cli` causes exactly one project to be verified.
- **SC-006**: Installing twice at the same commit, on different machines, produces byte-identical
  recorded dependency resolution — and an install that would change it fails the pipeline.
- **SC-007**: The count of published archives containing a workspace-local dependency reference is
  zero, and an attempt to publish one fails 100% of the time.
- **SC-008**: Bumping `@seeliang/f2r-core` produces a bumped `@seeliang/f2r-cli` whose recorded
  range on core matches the new version, with zero manual edits.
- **SC-009**: `@seeliang/f2r-cli@0.1.0` installs into an empty project on a machine that has never
  seen this repository, resolving `@seeliang/f2r-core@0.1.0` and the sample package transitively,
  with zero unresolved dependency references.
- **SC-010**: `@seeliang/f2r-theme@0.1.0` installs and resolves the same way.
- **SC-011**: Every project answers to the same task names; the count of projects requiring a
  bespoke command is zero.
- **SC-012**: Adding a project requires edits inside that project's directory and to the recorded
  dependency resolution only — zero edits to any central list of projects.
- **SC-013**: A publish attempted outside the pipeline fails 100% of the time.
- **SC-014**: The count of changes merged to the default branch without a passing pipeline run is
  zero.
- **SC-015**: The count of credentials committed to the repository is zero, and the count of
  long-lived secrets stored for a purpose the pipeline's run-scoped identity could serve is zero.
- **SC-016**: A consumer can verify which commit and pipeline run produced any published `0.1.0`
  without any access to this repository.
- **SC-017**: Every workspace-wide command exits successfully on a repository containing no
  projects.

## Assumptions

- **The tools are given, not chosen here.** The request names NX and pnpm, and constitution **P6**
  already commits the project to NX and CI for versioning and releases. This specification therefore
  states the outcomes the workspace must deliver rather than re-opening the choice; the requirements
  are written so they can be checked against whatever configuration the plan produces.
- **Native configuration first.** Constitution **P1** rules out wrapper and preset layers. A
  requirement here is satisfied by the tool's own configuration, not by a repository-specific
  abstraction over it.
- **`ai-plugin/cli` depends on `ai-plugin/core`, and that is a real direction** — a command-line
  entry point over a library, which is the shape the sibling repository already has. It is not an
  edge invented to satisfy FR-012.
- **`packages/theme` depends on nothing in the workspace.** The generator writes the design system;
  it does not consume it. Wiring `ai-plugin/*` to `packages/theme` would produce an edge that
  contradicts **P6**, so `theme` is a disconnected node and FR-017 covers that case explicitly. The
  second internal edge this project will eventually have is `packages/<component>` → `packages/theme`,
  which cannot exist until `theme` has content.
- **The three packages are real, not scaffolding.** Constitution **P2** forbids creating a directory
  ahead of its first real file. Each of these directories arrives with a published package in it,
  and later features fill them in rather than replacing them — which is also why they are preferred
  over a disposable probe: a probe that is deleted stops proving anything the day it is deleted.
- **The registry is GitHub Packages and the scope is `@seeliang`**, matching the repository owner,
  so the scope is owned by definition and no name-availability check is needed. Deleting a published
  version is possible on this registry, but re-publishing the same version number is not: `0.1.0` is
  spent once used, for each of the three names.
- **⚠️ This registry has required authentication to install even *public* packages.** If that still
  holds, it is the largest consequence of the registry choice: every contributor needs a read token
  before `install` works, and so does every consumer. The specification accommodates it — FR-002,
  FR-003, FR-046, SC-001, SC-002 — rather than assuming it away. **The plan must verify current
  behaviour before building around it.** User Story 5 is what turns this from an assumption into a
  fact, on the first install, before anything is published.
- **The pipeline is GitHub Actions**, authenticating to GitHub Packages with its own run-scoped job
  identity rather than a stored personal token — which is why FR-033 forbids a long-lived secret
  where the run-scoped identity suffices.
- **Provenance (FR-037) may need a different mechanism on this registry** than on public npm, where
  it is a single publish flag. The outcome required is a consumer-verifiable link from artifact to
  commit and run; the plan chooses how. If it costs materially more than a flag, record it in
  *Complexity Tracking* rather than dropping it silently.
- **The dependency on `@seeliang/github-package-sample` is temporary scaffolding** and is expected to
  be removed once `ai-plugin/cli` has real dependencies. It sits on `cli` rather than `theme` so
  that one consumer install proves the workspace rewrite and external transitive resolution at once,
  and so that no temporary dependency ships in the consumer-facing design-system package.
- **Contributors work on macOS or Linux; the pipeline runs Linux.** Windows support is out of scope
  until someone needs it.
- **A current Node LTS release** is the runtime; the exact range is a planning decision.
- **`.env` (holding the Figma token) is machine-local** and is not required by any workspace task.
  No workspace task reaches the network except dependency installation and publication.

## Out of Scope

- **What the three packages contain.** Tokens, fonts, CSS custom properties, the Figma integration,
  the generator's actual behaviour, component emission and Storybook are all later features. This
  one delivers packages that build, publish and install; the next ones give them something to say.
- **The `packages/<component>` → `packages/theme` edge**, which cannot exist until `theme` has
  content.
- **Any check enforcing a constitution principle other than P6.** The checks the constitution marks
  `NOT BUILT` under P1–P5 and P7 are separate features. FR-037 closes one P6 check (provenance); the
  dependency-vulnerability and licence-audit checks P6 also names are not in scope.
- **Migrating anything from the sibling `figma-to-react` repository.**
