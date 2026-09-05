# Specification Quality Checklist: One catalogue at the root, every story beside its code

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — one residual, see Notes
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

**Iteration 1 — two issues found and fixed.**

1. *No implementation details*: the draft named Storybook, `.storybook/`, `*.stories.tsx` globs and
   CSS `@import` throughout. The tool is a planning decision, not a requirement — the requirement is
   "one catalogue, discovered by location". Rewritten to describe the catalogue, stories, discovery
   and theme application without naming the tool. The user's own wording ("storybook setup at the
   root") is preserved verbatim in **Input** so intent is not lost.
2. *Success criteria technology-agnostic*: SC-004 originally asserted `var(--color-*)` resolution.
   Restated as "render with the theme's declared values; none fall back to a default typeface or an
   unresolved colour".

**Residual implementation detail, accepted deliberately.** US3's *Why this priority* names "CSS
custom properties" and FR-005 requires the typeface declaration to be "ordered ahead of all other
style rules". Both are strictly implementation-flavoured. They are kept because constitution **P1**
is non-negotiable law that fixes the styling substrate, and because the ordering constraint fails
*silently* into a fallback typeface — a requirement that cannot be stated without it. Flagged here
rather than passed over.

**No [NEEDS CLARIFICATION] markers.** Two candidates were considered and resolved with defaults
rather than questions:

- *Is running stories as automated checks in scope?* Resolved as **harness only** — User Story 4
  (P3) requires an unattended build that fails on a broken story, because `gates.md` already counts
  two checks that depend on stories being executable. The assertions themselves are listed as out of
  scope in Assumptions.
- *Is hosting/deploying the catalogue in scope?* Resolved as **no**. Nothing in the request mentions
  it, and `001` already owns the publish pipeline. FR-007 requires a self-contained bundle, which is
  the prerequisite for hosting without committing to it.

**Constitution alignment** (`.specify/memory/constitution.md` v3.0.0):

| Principle | Bearing on this spec |
| --------- | -------------------- |
| **P1** | Theme is ordinary CSS custom properties; drives US3 and FR-005 |
| **P2** | "Stories live beside the components they document" — this feature *implements* an existing principle; also why FR-012 excludes `ai-plugin/` |
| **P3** | Orphaned stories after a rename are an edge case here, fixed elsewhere |
| **P4** | Stories are artifacts; drives US2, FR-002, FR-011 — a central registry would violate it |
| **P7** | Explicitly out of scope and flagged, so the spec is not misread as satisfying a non-negotiable |

**One judgement worth surfacing at planning.** FR-010 (title collisions) has no obvious mechanism —
detecting a duplicate title across packages may need a check that does not exist yet. If planning
finds no cheap way to satisfy it, it is a candidate for **Complexity Tracking** in `plan.md` rather
than silent omission.
