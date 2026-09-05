# Flow

> The lifecycle this project follows, and the skill that runs each stage.
> [gates.md](gates.md) says what each stage must *prove*;
> [constitution.md](../.specify/memory/constitution.md) holds the principles every stage obeys.

## The standard lifecycle

Microsoft's [Spec-Driven Development: AI-Native Engineering][ms] defines SDD as "a spec-first
approach" where "teams define common guardrails, requirements, constraints, acceptance criteria, and
edge cases up front, then use AI to generate code, tests, and supporting artifacts from that shared
context."

The problem it names is *translation loss* at four handoffs: "Stakeholder needs to product
requirements; Requirements to architecture and design; Design to implementation; Implementation to
validation and release."

We run GitHub Spec Kit's seven stages as stated.

## The stages

| # | Stage | Skill | Reads | Writes |
| - | ----- | ----- | ----- | ------ |
| 0 | **Constitution** | `/speckit-constitution` ⚠️ | — | `.specify/memory/constitution.md` |
| 1 | **Specify** | `/speckit-specify` | the request | `specs/###-name/spec.md` |
| 2 | **Clarify** | `/speckit-clarify` · `figma2react audit` | `spec.md`, the Figma input | `spec.md` (answers encoded back) |
| 3 | **Plan** | `/speckit-plan` | `spec.md`, constitution | `plan.md`, `research.md` |
| 4 | **Tasks** | `/speckit-tasks` | `plan.md`, `spec.md` | `tasks.md` |
| 5 | **Implement** | `/speckit-implement` · `figma2react gen` | `tasks.md` | source, `tokens.css`, `*.feature` |
| 6 | **Validate** | `/speckit-analyze` · `/speckit-checklist` | all of the above | a report — writes nothing |

⚠️ **Do not run `/speckit-constitution`.** It rewrites the constitution from principle inputs and
would drop the per-principle **Check** lines, which the template has no slot for. The constitution
is hand-maintained and versioned; amend it directly.

Every change is a numbered feature, including a token refresh. `specify extension add git` is
installed, so each feature gets a `###-name` branch.

## Where our own tools attach

Two commands predate Spec Kit and keep a place in the lifecycle:

**`figma2react audit` — Clarify.** The Figma file is an **input**, not the spec. `clarify` resolves
ambiguity in `spec.md`; `audit` answers the narrower question of whether the Figma input can be
generated from at all — a colour bound to no Style has no name to generate, a hover state nobody
designed cannot be invented. It reads and reports, and is offline and free, so it can run before
every change.

A gap it finds is a **Figma edit or a spec edit**, never a code patch. Hard-coding a value nobody
chose hides an incomplete input instead of completing it.

**`figma2react gen` — Implement.** The only command that writes generated output. It produces
projections (`figma-tokens.md`, `figma-tokens.json`) and artifacts (`tokens.css`, components,
stories). Neither survives the next run.

Check `git status` afterwards — `gen` does not delete files it no longer generates, so a variant
renamed in Figma leaves an orphan behind that still compiles.

## Optional stages

`clarify`, `analyze` and `checklist` are optional in Spec Kit. They are not optional here:
`analyze` is the only automated check that a feature's artifacts agree with each other and with the
constitution, and it treats a constitution conflict as CRITICAL requiring "adjustment of the spec,
plan, or tasks — not dilution, reinterpretation, or silent ignoring" of the principle.

[ms]: https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/
