# Constitution

> Spec-driven stage: **constitution** — the principles every other stage obeys.
> Law, not procedure: [gates.md](../../docs/gates.md) says what each stage must prove, [flow.md](../../docs/flow.md) names
> the lifecycle, [ai-solution.md](../../docs/ai-solution.md) says why the method is shaped this way.

## Mission

Read a Figma design, generate React components with vanilla CSS, and host them in Storybook.

## How to read this

Each principle is numbered so everything downstream can cite it. A principle states one **Rule**, the
**Rationale** that justifies it, and the **Check** that proves it — or `NOT BUILT`, because a
principle with no check is a wish, not a rule. That is the same standard [gates.md](../../docs/gates.md) holds
every criterion to, applied to the constitution itself.

`(NON-NEGOTIABLE)` marks a principle that no local decision may trade away.

---

### P1 — Pure CSS and native primitives (NON-NEGOTIABLE)

**Rule.** Styling is ordinary CSS and CSS custom properties. Utility frameworks, configuration
layers, presets and design-system wrappers are out of scope. Use native platform configuration
first: TypeScript project references, Vite's React plugin. A dependency enters only when it removes
a demonstrated project-specific problem *and* does not obscure the native configuration it replaces.

Generated components own a nearby `styles.css`; the shared theme package owns `fonts.css` and
`tokens.css`.

**Rationale.** Popularity is not a reason. The output of this generator is committed and read by
people, so it must stay legible to anyone who knows CSS — a wrapper moves the real configuration
somewhere they will not look. This commitment is also why CSS payload, not Core Web Vitals, is the
performance surface that matters here.

**Check.** `verify-styles.mjs` — generated classes resolve to real CSS (built). `verify-tokens.mjs`
— no duplicate custom properties (**warn-only**). `tsc -b` with `strict` and
`noUncheckedIndexedAccess` (partial). Nothing prevents a framework dependency being added —
**NOT BUILT**.

### P2 — One responsibility per part

**Rule.** Each part of the repository has one clear responsibility and keeps its documentation,
implementation and tests together. Stories live beside the components they document; a plugin keeps
its instructions, executable code and distribution metadata in one scope. Consumer-installable code
belongs in `packages/`; generator and repository tooling belongs in `ai-plugin/`.

Prefer a shallow structure where ownership is obvious from the path. Do not create a directory
unless it establishes a useful boundary, and do not scaffold one ahead of its first real file.

**Rationale.** Ownership that has to be looked up is ownership that decays. A shallow tree makes the
boundary visible in a path rather than documented in a file that drifts.

Spec Kit's per-feature artifacts (`spec.md`, `plan.md`, `tasks.md`, and optionally `research.md`,
`data-model.md`, `contracts/`) sit against this principle by design. The escape hatch is
`plan.md`'s **Complexity Tracking** table — *Violation | Why Needed | Simpler Alternative Rejected
Because* — which forces the justification to be written down rather than assumed.

**Check.** Generator coverage via `vitest run` (partial — no threshold). Nothing asserts that
`packages/` and `ai-plugin/` stay separated, or that documentation exists beside implementation —
**NOT BUILT**.

### P3 — Generated output is disposable (NON-NEGOTIABLE)

**Rule.** Never fix a problem in generated output. The fix belongs in the design file or in the
generator. A generation run removes and rewrites the code and stories it owns; nothing hand-written
survives there.

**Rationale.** Editing an artifact produces a change the next generation silently deletes — and,
worse, a green build that no longer reflects the design. Argued in full in
[ai-solution.md](../../docs/ai-solution.md).

**Check.** `git diff --exit-code packages/` after regenerating (built, **not in CI**). Note that
`gen` does not delete files it no longer generates, so a renamed variant leaves an orphan that still
compiles.

### P4 — Every path declares its kind

**Rule.** **Nothing under `packages/` is authored.** Every path there is a **projection** or an
**artifact**, and which one must be readable from the name alone.

The only authored specification is `specs/###-feature/spec.md`. `*.feature` files are **generated**
from its Acceptance Scenarios — they are artifacts, not specs, and editing one is the same mistake
as editing `tokens.css`.

```
specs/###-feature/
  spec.md                              SPEC       authored — the only one
  plan.md  tasks.md  research.md       DERIVED    regenerating overwrites

docs/                                  decisions — why, not how

packages/theme/src/
  color.feature                        ARTIFACT   generated from spec.md
  figma-tokens.md  figma-tokens.json   PROJECTION regenerated
  tokens.css  tokens.json  fonts.css   ARTIFACT   regenerated
  theme.stories.tsx                    ARTIFACT   regenerated

packages/<component>/src/
  <component>.feature                  ARTIFACT   generated from spec.md
  <Component>.tsx  styles.css          ARTIFACT   regenerated
  <Component>.stories.tsx              ARTIFACT   regenerated
```

**Rationale.** Confusing the kinds is the failure this method exists to prevent. A file whose kind
is unclear invites someone to edit output that the next run deletes. Behaviour is specified once, in
`spec.md`, so there is no second Gherkin source to drift from it.

**Check.** Nothing asserts that no file under `packages/` is hand-edited — **NOT BUILT**, and
greppable. The `spec.md` → `*.feature` generator does not exist yet — **NOT BUILT**.

### P5 — Skills ship and version with the CLI

**Rule.** **Shipped** skills — those published as part of `@figma-to-react/cli` — live in
`ai-plugin/cli/skills/`, named by **stage or topic, never by role**. Repo-local tooling skills that
are never published live in `.claude/skills/` and are outside this rule; Spec Kit's `speckit-*`
skills are installed there.

The
Claude Code plugin is part of the `ai-plugin/cli` NX project, not a separate one: its skills,
manifest and executable code ship in the same `@figma-to-react/cli` package. NX inputs for the CLI
include the plugin files, and `.claude-plugin/plugin.json` must remain version-locked to
`ai-plugin/cli/package.json`.

```
ai-plugin/cli/
  .claude-plugin/plugin.json           version-locked to package.json
  skills/
    design-system/SKILL.md             router
    ds-audit/SKILL.md                  gate
    ds-theme/SKILL.md                  topic: theme
    ds-generate/SKILL.md               generate
    ds-verify/SKILL.md                 verify
```

**Rationale.** The location is what makes a skill build, test, pack and release with the code it
documents; a skill that ships separately documents a version nobody is running. The naming is
because roles are responsibilities, not processes — a skill called `qa` re-encodes the role split as
an execution path, and people ask "why is this colour wrong", not "be the QA".

**Check.** Nothing enforces the version lock between `.claude-plugin/plugin.json` and
`ai-plugin/cli/package.json` — **NOT BUILT**, and it is a five-line check.

### P6 — Distribution integrity

**Rule.** NX and CI manage semantic versioning and releases. The workspace dependency graph must
reflect the real dependency direction so chained versioning and affected detection are reliable.
Releases are published from CI, never from a laptop.

**Rationale.** Chained versioning is only as trustworthy as the graph it walks. Publishing from CI is
what makes provenance and attestation meaningful — though provenance proves origin, not safety.

**Check.** Dependency vulnerabilities, licence audit and publish provenance are all **NOT BUILT** —
see [gates.md](../../docs/gates.md) § Verify.

### P7 — Accessibility is built in, not retrofitted (NON-NEGOTIABLE)

**Rule.** Generated components ship with correct roles, accessible names, focus order and keyboard
behaviour. Accessibility is a generator responsibility, not a consumer's.

**Rationale.** A component library is where accessibility is either built in or permanently absent
from everything downstream — no consumer can retrofit what the components do not do. The European
Accessibility Act has been in force since 28 June 2025, with EN 301 549 / WCAG 2.1 AA as the
presumed compliance standard.

**Check.** **NOT BUILT** — no `@storybook/addon-a11y`, no axe-core, and the emitter produces no
`tabIndex`, `role` or key handlers. Of every criterion in [gates.md](../../docs/gates.md), this is the one whose
deadline has already passed.

---

## Governance

**Authority.** This document binds every stage. Where another doc conflicts with a principle here,
this one wins and the other is wrong.

**Amendment.** A principle changes by editing this file and bumping the version below. Every
amendment must state its Check or mark it `NOT BUILT`; a principle may not be added without saying
how it would fail.

| Bump      | Trigger                                          |
| --------- | ------------------------------------------------ |
| **MAJOR** | a principle removed, or redefined incompatibly   |
| **MINOR** | a principle added, or its scope materially widened |
| **PATCH** | wording, rationale and clarification only        |

**Compliance review.** Enforced at the Constitution Check gate during planning, and by checks that
run on every change. [gates.md](../../docs/gates.md) is where each principle's check is tracked, and its
standing criteria cite the principle they enforce.

**Version:** 3.0.0 | **Ratified:** 2026-09-05 | **Last amended:** 2026-09-05

*3.0.0 — MAJOR. P4 redefined again on adopting GitHub Spec Kit: `*.feature` files change from
authored specs to artifacts generated from `spec.md`'s Acceptance Scenarios, so nothing under
`packages/` is authored. P5 clarified: it governs shipped skills; repo-local tooling skills live in
`.claude/skills/`. P2 now names Complexity Tracking as the escape hatch for per-feature artifacts.*

*2.0.0 — MAJOR. P4 redefined: the prohibition on a `specs/` directory and on files named `spec.md`
is removed, on adopting spec-first SDD. Governance changed: constitution compliance is now enforced
at a planning gate as well as by continuous checks.*
