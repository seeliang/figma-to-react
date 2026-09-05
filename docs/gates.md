# Gates

> Spec-driven stage: **all of them** — this is what each stage must prove before it is passed.
> See [README.md](README.md) for the pipeline, [ai-solution.md](ai-solution.md) for why.

What must be true to pass each gate, stated so it can fail.

A criterion with no check is a wish. This is the same rule
[ai-solution.md](ai-solution.md) applies to specs — only authoritative if the system continuously
proves compliance — so every row below either names a check or says `NOT BUILT`.

## Two kinds of criterion

Which kind a criterion is decides **who fixes a failure**, and that routing is the reason this doc
exists rather than a checklist.

| Kind             | Who decides "correct"                            | A failure means    |
| ---------------- | ------------------------------------------------ | ------------------ |
| **Spec-derived** | `spec.md`, and the Figma input it references     | a **spec or Figma edit** |
| **Standing**     | [constitution.md](../.specify/memory/constitution.md), independent  | a **code fix**     |

A standing criterion enforces a constitution principle, so the tables below cite it by number. A
`—` in that column means no principle authorises the criterion: either the constitution is missing
one, or the row is a quality bar rather than a rule. Both are worth knowing; neither is silent.

You cannot test dark-mode parity if the design has no dark mode. A spec-derived criterion with
nothing behind it in Figma is not a failing test — it is an incomplete spec, and `audit` reports it
as one.

**Accessibility spans both**, which is why it is not a single row: focus order and interaction
states are design decisions; contrast, roles and names are mechanical.

## Clarify — the spec and its Figma input are complete enough to plan from

All spec-derived. Completeness of `spec.md` itself is resolved at **Clarify**; the rows below are
the ones that depend on the Figma input, which `figma2react audit` reads.

| Criterion                  | Kind         | Check                                | Status    |
| -------------------------- | ------------ | ------------------------------------ | --------- |
| Interaction states designed | spec-derived | `audit` → `missingInteractiveStates` | built     |
| Breakpoints defined        | spec-derived | `audit` → `missingBreakpoints`       | built     |
| Colours bound to Styles    | spec-derived | `audit` → `unboundColours`           | built     |
| Components sorted, owned   | spec-derived | `audit` → `unclassifiedLayers`       | built     |
| Dark/light parity          | spec-derived | —                                    | NOT BUILT |
| RTL specified              | spec-derived | —                                    | NOT BUILT |
| Keyboard/focus order       | spec-derived | —                                    | NOT BUILT |
| Empty / overflow states    | spec-derived | —                                    | NOT BUILT |

The last four have no counterpart in Figma today. Until the design expresses them, no check can be
written — that is a design task, not a tooling gap.

## Implement — the artifact matches the spec

| Criterion                   | Kind         | Principle | Check                                           | Status                   |
| --------------------------- | ------------ | --------- | ----------------------------------------------- | ------------------------ |
| Design-to-code parity       | spec-derived | —         | `expectLayoutWithin`, 4px, in a browser         | built — **runs on zero** |
| Token values painted        | spec-derived | —         | `expectTokensRendered`                          | partial                  |
| Token drift vs the design   | spec-derived | —         | `verify-tokens.mjs`                             | built                    |
| No duplicate custom props   | standing     | **P1**    | `verify-tokens.mjs`                             | **warn-only**            |
| Classes resolve to CSS      | standing     | **P1**    | `verify-styles.mjs`                             | built                    |
| TypeScript strictness       | standing     | **P1**    | `tsc -b`, `strict` + `noUncheckedIndexedAccess` | partial                  |
| Generator coverage          | standing     | **P2**    | `vitest run`                                    | partial — no threshold   |
| Documentation coverage      | standing     | **P2**    | —                                               | NOT BUILT                |
| API/prop contract stability | standing     | **P6**    | —                                               | NOT BUILT                |
| Output matches a fresh run  | standing     | **P3**    | `git diff --exit-code packages/`                | built — **not in CI**    |
| Nothing under `packages/` hand-edited | standing | **P4** | —                                        | NOT BUILT                |
| `*.feature` generated from spec.md    | standing | **P4** | —                                        | NOT BUILT                |

Parity is **geometry, not pixels** — `expectLayoutWithin` compares x/y/w/h against
`figma-geometry.json`. Colour, type, borders and shadows are never compared to Figma.

`expectTokensRendered` compares only colour, font family, radius and spacing; other kinds are
skipped silently.

## Validate — it behaves, and is safe to ship

| Criterion                    | Kind     | Principle | Check | Status    |
| ---------------------------- | -------- | --------- | ----- | --------- |
| Accessibility (mechanical)   | standing | **P7**    | —     | NOT BUILT |
| Keyboard / focus interaction | both     | **P7**    | —     | NOT BUILT |
| Visual regression            | standing | —         | —     | NOT BUILT |
| Cross-browser rendering      | standing | —         | —     | NOT BUILT |
| SSR / hydration              | standing | —         | —     | NOT BUILT |
| Bundle size + CSS payload    | standing | **P1**    | —     | NOT BUILT |
| Composability edge cases     | both     | —         | —     | NOT BUILT |
| Dependency vulnerabilities   | standing | **P6**    | —     | NOT BUILT |
| Licence audit                | standing | **P6**    | —     | NOT BUILT |
| Publish provenance           | standing | **P6**    | —     | NOT BUILT |
| Plugin manifest version-lock | standing | **P5**    | —     | NOT BUILT |

### Accessibility is the urgent one

The European Accessibility Act became law across the EU on **28 June 2025** and is in force; the
presumed compliance standard is EN 301 549, incorporating WCAG 2.1 AA.

A component library is where accessibility is either built in or permanently absent from everything
downstream — no consumer can retrofit what the components do not do. Today there is no
`@storybook/addon-a11y`, no axe-core, and the emitter produces no `tabIndex`, `role` or key
handlers, only `aria-hidden="true"` on decorative vectors.

Of every criterion in this document, this is the one with a deadline that has already passed.

### Coverage is not a criterion for pure components

Coverage measures execution, not correctness — a test that renders a component and asserts nothing
reports full coverage and catches nothing. That is acute for *pure* components, which render props
to markup.

These components are also **generated**, so unit-testing them tests the generator, which has its own
tests already. Coverage therefore belongs on the generator and on the `.feature` specs. For a
component, the meaningful checks are parity, token painting, accessibility and visual regression.
Where a number is wanted, mutation score is the stronger signal than line coverage.

### Performance is CSS payload, not Core Web Vitals

Core Web Vitals are page-level; a component has no LCP. What is measurable per component is **CSS
payload, DOM depth, and INP contribution**. A mature design system can exceed 100KB of uncompressed
CSS, and since [constitution.md](../.specify/memory/constitution.md) P1 commits to pure CSS, payload is this project's primary
performance surface — which is why it shares a row with bundle size rather than standing alone.

### Security is two things

**Dependency vulnerabilities** — `pnpm audit`, and a licence check if this ships externally.

**Publish-time supply chain** — npm provenance, SLSA attestation, and trusted publishing, where the
registry accepts only versions carrying a valid OIDC attestation from CI rather than from a laptop.
[constitution.md](../.specify/memory/constitution.md) P6 already has NX and CI publishing, so that control applies directly.

One caveat, so nobody treats attestation as sufficient: in May 2026 a worm compromised 170+ npm and
PyPI packages carrying *valid* SLSA Build Level 3 provenance. **Provenance proves origin, not
safety.**

## What the tables above admit

Six things are true today and worth stating plainly, because other docs imply otherwise:

1. **Design parity runs on zero components.** Only `packages/theme` is generated, and its stories
   call `expectTokensRendered`, never `expectLayoutWithin`.
2. **The duplicate-property check is warn-only.** A token collision passes `pnpm verify`.
3. **`typecheck` names three packages that do not exist** (`packages/atoms|molecules|organisms`).
4. **Nothing runs in CI.** There is no `.github/` directory, so every check `ai-solution.md` calls
   mandatory is currently opt-in.
5. **Accessibility has no check at all**, past its compliance deadline.
6. **Four standing criteria cite no principle** — visual regression, cross-browser rendering,
   SSR/hydration and composability edge cases. Nothing in
   [constitution.md](../.specify/memory/constitution.md) authorises them. Either they earn a principle or they are
   quality bars rather than rules, and that is a decision nobody has made yet.

One genuine tension to decide rather than discover: **composability stories conflict with the 4px
parity gate.** Long-content and overflow stories move boxes well past the threshold, so edge-case
stories will need excluding from `expectLayoutWithin`. That is a decision, not an oversight.

## This document and Spec Kit's own checks

Three things overlap here and are easy to confuse. They are complementary, and the difference is
scope:

| | What it checks | Scope |
| --- | --- | --- |
| `/speckit-analyze` | cross-artifact consistency; constitution alignment | one feature, automated |
| `/speckit-checklist` | requirements *quality* — is the spec any good? | one feature, reviewer-owned |
| **this document** | the standing criteria, and whether a check exists at all | repo-wide |

`gates.md` is the inventory of what must be provable. The commands are what run against one
feature. A green `analyze` on a feature says nothing about the rows below that are `NOT BUILT`.

## How to use this

1. **A gate is claimed only when every criterion in it has a passing check.** Do not run a subset
   and call it verified — say which criteria actually ran.
2. **`NOT BUILT` blocks the claim.** An unbuilt criterion does not silently pass; it means the gate
   cannot be asserted, and saying so is the honest report.
3. **Route a failure by its kind.** Spec-derived → a spec or Figma edit. Standing → a code fix, and the
   Principle column names the rule that was broken. Never
   patch generated output to turn a gate green; see
   [ai-solution.md](ai-solution.md) for why that is the one move that breaks the method.
4. **CI runs this, not a person.** Until `.github/workflows/` exists, every row above is a statement
   of intent rather than an enforced gate.
