# Specification Quality Checklist: Workspace foundation — one install, a real graph, three published 0.1.0s

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 4 (2026-09-05) — all 16 items pass.** Seven user stories, 49 functional requirements,
17 success criteria, 12 edge cases. **The *Known gap* section is gone**: every requirement in this
spec is now verifiable against the repository itself.

### Decisions resolved

| # | Question | Answer | Encoded as |
| - | -------- | ------ | ---------- |
| Q1 | Workspace config alone, or a first real project? | Real packages, minimal content, **actually published at `0.1.0`** | Story 3; FR-039 … FR-046 |
| Q2 | Is the release pipeline in scope? | **Yes** — GitHub Actions, including publish | Story 4; FR-030 … FR-038 |
| Q3 | Package identity | **`@seeliang`** scope on GitHub Packages | FR-002, FR-039; Assumptions |
| Q4 | How to give the graph an edge | First: consume `@seeliang/github-package-sample`. Then, on review: **a real internal edge** | Stories 2 and 5 |
| Q5 | Keep publish provenance? | **Yes** | FR-037 |
| Q6 | Which probe for the graph? | **Option A** — `ai-plugin/core` ← `ai-plugin/cli`, kept, not thrown away | Story 2; FR-012, FR-040 |

### What Q6 changed, and why it matters

The deliverable went from one package to three, and four requirements moved from *documented as
unverifiable* to *checked on every CI run*: FR-014 (cycles), FR-019 (transitive affected), FR-026 /
FR-027 (pack-time rewriting) and FR-028 (version chaining). The reasoning against a disposable probe
is recorded in the Assumptions: these are **continuous properties**, and they break exactly when the
probe would already be gone — on a package-manager bump, a build-tool major, or the day the first
tarball with an unrewritten workspace reference reaches a consumer.

Two consequences worth noting:

- **`packages/theme` is a disconnected node**, and correctly so. The generator writes the design
  system; it does not consume it. Wiring `ai-plugin/*` to `theme` would manufacture an edge that
  contradicts constitution **P6**, so FR-013 forbids declaring a dependency to produce an edge, and
  FR-017 makes handling an edgeless project a requirement in its own right.
- **The sample dependency moved from `theme` to `cli`.** One consumer install of
  `@seeliang/f2r-cli@0.1.0` now proves the workspace rewrite *and* external transitive resolution
  *and* consumer auth in a single act (SC-009), and no temporary scaffolding dependency ships in the
  consumer-facing design-system package. Easily reverted if that reads wrong.

FR numbering was resequenced; nothing downstream references the old IDs, as no `plan.md` or
`tasks.md` exists yet. This is the last resequencing — `/speckit-plan` will cite these IDs.

### Items that needed argument rather than a tick

*"No implementation details" — passes, with a caveat worth stating.* The description names two
tools; the answers name a registry and a pipeline. Naming them in the requirements would make those
requirements unfalsifiable ("MUST use NX" proves nothing), so they live in Assumptions as **given
constraints** while every FR and SC states a checkable outcome. Package identities and paths do
appear in requirements — they are the deliverable's identity, not an implementation choice. FR-026 /
FR-027 say "workspace-local dependency reference" rather than naming the protocol, deliberately: the
requirement is that no such reference survives packaging, whatever the tool calls it.

*"Written for non-technical stakeholders" — passes for an infrastructure feature.* *Internal edge*,
*external edge*, *lockfile*, *credential*, *pipeline* are the subject matter, not jargon layered over
it; each is defined in Key Entities, and the diagram at the top of the spec carries the shape
without prose.

*"Requirements are testable" — FR-014 needs a word.* A cycle cannot be shipped, so its check is a
test that introduces the reverse edge and reverts it. That is now *possible* — with two workspace
projects, a cycle is constructible, which it was not in iteration 3. Story 2 scenario 7 states the
test shape.

### Carried into planning

1. **⚠️ Does this registry still require authentication to install public packages?** Historically
   it has. If so, every contributor needs a read token before their first install succeeds, and so
   does every consumer — a real adoption cost, not a detail. The spec survives either answer
   (FR-002, FR-003, FR-046, SC-001, SC-002), but the plan must check current behaviour rather than
   inherit the assumption. Story 5 settles it on the first install, before anything is published.
2. **Provenance may not be one flag here.** On public npm it is; on this registry the mechanism is
   likely different. FR-037 states the outcome, not the mechanism. If it costs materially more,
   record it in *Complexity Tracking*.
3. **Three names get spent at `0.1.0`.** `@seeliang/f2r-theme`, `@seeliang/f2r-core` and
   `@seeliang/f2r-cli`. Versions can be deleted on this registry but a number cannot be reused.
4. **FR-038 (partial release) has no obvious cheap answer.** Publishing three packages in one run
   can fail halfway. Atomicity across separate registry publishes generally is not available, so the
   likely shape is precise reporting plus a resumable release rather than a transaction — the plan
   should say which, explicitly.
