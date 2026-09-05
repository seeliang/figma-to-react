# Feature Specification: One catalogue at the root, every story beside its code

**Feature Branch**: `002-root-storybook-colocated`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "would like to have storybook setup at the root and the story is imported from package/ folder. the story lives with code"

## User Scenarios & Testing *(mandatory)*

The people this feature serves are **contributors** (anyone working in this repository), **reviewers**
(designers and QA confirming a component matches the design it came from), and the **generator**
(the unattended process that writes components and their stories).

This feature builds on `001-nx-pnpm-workspace`, which establishes the workspace and
`packages/theme`. It adds one component catalogue for the whole repository, assembled from stories
that live in the packages rather than in a central folder.

### The shape being built

```
  repository root
  ┌──────────────────────────────────────────────────────────┐
  │  the catalogue  ─── one configuration, one command       │
  │        ▲                                                 │
  │        │ discovers, never registers                      │
  │        │                                                 │
  │   packages/theme/src/          packages/<component>/src/ │
  │     theme story                  component + its story   │
  │     tokens, fonts                styles                  │
  └──────────────────────────────────────────────────────────┘
```

One catalogue, many sources. A package contributes by containing a story, not by being listed
anywhere.

### User Story 1 — A contributor sees every component in one place (Priority: P1)

Someone clones the repository and wants to see what the design system currently contains. They run
one command at the root and get a browsable catalogue showing every component from every package,
grouped so they can find one without knowing which package it lives in.

They never start a separate catalogue per package, never learn which packages have one, and never
reconcile several catalogues that disagree.

**Why this priority**: This is the feature. Without it there is nothing to browse, and the
repository has no way to show what it produces. Everything below refines it.

**Independent Test**: Clone the repository, install, run the single documented command, and confirm
the catalogue opens and lists the stories that exist in the workspace today.

**Acceptance Scenarios**:

1. **Given** a clean clone with dependencies installed, **When** a contributor runs the documented
   catalogue command at the repository root, **Then** a browsable catalogue opens listing every
   story present in every workspace package.
2. **Given** the workspace contains only `packages/theme`, **When** the catalogue opens, **Then** it
   lists the theme's stories and reports no error about missing component packages.
3. **Given** a contributor is viewing any component, **When** they look at its entry, **Then** they
   can reach the design source that component was generated from without leaving the catalogue.

---

### User Story 2 — A story appears without being registered (Priority: P2)

The generator writes a component and its story into a package. Nobody edits a central list, an index
file, or the catalogue's configuration. The next time the catalogue runs, the new component is in
it.

**Why this priority**: Registration is the failure mode this feature exists to avoid. Constitution
**P4** makes everything under `packages/` generated output, so a central registry would be a hand-
maintained file that the generator must also update — a second source of truth that drifts the first
time someone renames a variant.

**Independent Test**: Add a package containing a story, run the catalogue without editing any
configuration, and confirm the story appears.

**Acceptance Scenarios**:

1. **Given** a new package containing a story, **When** the catalogue is started, **Then** that
   story appears with no edit to any configuration file.
2. **Given** a package whose stories were removed, **When** the catalogue is started, **Then** it
   starts successfully and simply omits them.
3. **Given** a regeneration renames a component's variants, **When** the catalogue is started,
   **Then** it reflects the new names without manual reconciliation.

---

### User Story 3 — A component renders with the theme applied (Priority: P2)

A reviewer opens any component in the catalogue and sees it as designed — the right typeface, the
right colours — not a fallback rendering that silently differs from the design.

**Why this priority**: A catalogue that renders components without their theme is worse than none:
it shows something that looks like the component and is not, so a reviewer signs off on the wrong
thing. Constitution **P1** makes the theme ordinary CSS custom properties, and the typeface import
must precede every other rule or it fails silently into a fallback.

**Independent Test**: Open a component that consumes theme tokens and confirm the rendered values
match the token values the theme declares, including the typeface.

**Acceptance Scenarios**:

1. **Given** a component that consumes theme tokens, **When** it renders in the catalogue, **Then**
   every token it uses resolves to the value the theme declares rather than to nothing.
2. **Given** the theme declares a typeface, **When** any component renders, **Then** it uses that
   typeface rather than a fallback.
3. **Given** the theme changes and is regenerated, **When** the catalogue is restarted, **Then**
   components reflect the new values with no catalogue configuration change.

---

### User Story 4 — The catalogue can be checked unattended (Priority: P3)

The catalogue builds to a self-contained bundle that a pipeline can produce without a person
watching, so that later features can assert things about what it renders.

**Why this priority**: Lower than the above because the assertions themselves belong to other
features — but the harness has to exist before any of them can run, and `gates.md` already counts
two checks that depend on stories being executable.

**Independent Test**: Run the documented build command and confirm it produces a self-contained
bundle and exits non-zero if any story fails to build.

**Acceptance Scenarios**:

1. **Given** a workspace that builds, **When** the catalogue build command runs unattended,
   **Then** it produces a self-contained bundle and exits successfully.
2. **Given** a story that fails to build, **When** the build runs, **Then** it exits non-zero and
   names the story that failed.

---

### Edge Cases

- **Two packages produce the same story title.** Titles come from generated components; two packages
  could collide. The catalogue must not silently show one and drop the other.
- **A package has no stories.** Must not be an error — most packages will not have any at first.
- **No component packages exist at all.** Today only `packages/theme` exists; the catalogue must
  work in that state.
- **Orphaned stories.** Generation does not delete files it no longer writes (constitution **P3**),
  so a renamed variant leaves a stale story behind that still builds. The catalogue will show it,
  and the catalogue is not the place that fixes it.
- **Theme not yet generated.** A clone whose `packages/theme` output has not been generated should
  produce a comprehensible failure, not components rendered with missing values.
- **A story importing across package boundaries.** A story that reaches into another package
  contradicts **P2**; the catalogue should not make that easier than importing the package properly.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The repository MUST provide exactly one component catalogue, configured once at the
  root, for all workspace packages.
- **FR-002**: The catalogue MUST discover stories by their location within packages, so a package
  contributes by containing a story rather than by being registered anywhere.
- **FR-003**: Stories MUST reside in the same package and directory as the component they document.
- **FR-004**: The catalogue MUST start successfully when a package contains no stories, and when no
  component packages exist yet.
- **FR-005**: Components MUST render with the shared theme applied, with the typeface declaration
  ordered ahead of all other style rules.
- **FR-006**: Each component's entry MUST link to the design source it was generated from.
- **FR-007**: The catalogue MUST build to a self-contained bundle by a single documented command
  that exits non-zero on failure.
- **FR-008**: Contributors MUST be able to start the catalogue with a single documented command
  from the repository root after a standard install.
- **FR-009**: Adding, removing or renaming a package MUST NOT require editing catalogue
  configuration.
- **FR-010**: The catalogue MUST surface a title collision between two packages rather than
  silently rendering one of them.
- **FR-011**: The catalogue's configuration MUST be the only hand-authored part of this feature;
  everything it displays comes from generated output, per constitution **P4**.
- **FR-012**: Story discovery MUST be limited to consumer-installable packages, excluding generator
  and repository tooling.

### Key Entities

- **Catalogue**: the single browsable surface assembled from every package's stories. Authored
  configuration; lives at the repository root.
- **Story**: a generated file describing one component's variants. Lives beside its component inside
  a package. An artifact under **P4** — never hand-edited.
- **Component package**: a consumer-installable package under `packages/` that may contain
  components, their styles and their stories.
- **Theme**: the shared tokens and typeface every component resolves against, supplied to the
  catalogue once rather than per story.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean clone with dependencies installed, a contributor reaches a browsable
  catalogue with one command in under 2 minutes.
- **SC-002**: 100% of stories present in consumer-installable packages appear in the catalogue.
- **SC-003**: Adding a package that contains stories requires **zero** edits to any configuration
  file outside that package.
- **SC-004**: 100% of components render with the theme's declared values; none fall back to a
  default typeface or an unresolved colour.
- **SC-005**: A reviewer can go from any component to its design source in one step.
- **SC-006**: The catalogue builds unattended to a self-contained bundle, and a story that fails to
  build fails the command rather than being omitted.
- **SC-007**: The number of catalogue configurations in the repository is exactly one, regardless of
  how many packages exist.

## Assumptions

- **Depends on `001-nx-pnpm-workspace`.** The workspace, package layout and install path are
  established there; this feature adds the catalogue on top and does not restate them.
- **"package/ folder" means `packages/`** — the consumer-installable packages. Generator and
  repository tooling under `ai-plugin/` is excluded, because constitution **P2** separates the two
  and tooling is not part of the design system a reviewer browses.
- **Stories are generated, not written.** Constitution **P4** places every path under `packages/`
  in the generated category. This feature specifies where stories live and how they are found; what
  a story contains belongs to the generator.
- **The theme package exists but component packages may not.** Only `packages/theme` exists today,
  so the catalogue must be useful before any component package appears.
- **Accessibility checking is out of scope here.** Constitution **P7** is non-negotiable and
  currently `NOT BUILT`; the catalogue is where that check will eventually live, but adding it is a
  separate feature and this one must not be read as satisfying P7.
- **Visual regression, cross-browser and performance checks are out of scope.** All are `NOT BUILT`
  in `gates.md` and each is its own feature.

## Dependencies

- `001-nx-pnpm-workspace` — the workspace, the package layout, and the single install path.
- `packages/theme` — supplies the tokens and typeface required by User Story 3.
