# AI solution: spec-driven development

## The decision

This project uses **spec-driven development, spec-first**, via GitHub Spec Kit: an authored
specification is the source of truth, and code is a generated, verifiable artifact.

The problem it solves is **translation loss** — meaning degrading at each handoff from stakeholder
need to requirement, requirement to architecture, design to implementation, implementation to
validation. Prompt-first work has no durable record of intent, so each handoff re-derives it and
each derivation drifts.

An authored spec beats an implied one for a reason worth stating plainly: **an implied spec cannot
be reviewed, and cannot be wrong.** A Figma file expresses appearance precisely and expresses
nothing else — no priority, no acceptance criterion, no edge case, no reason. Those exist regardless;
leaving them unwritten does not remove them, it just moves them somewhere nobody can check. Writing
`spec.md` makes intent reviewable *before* it is expensive.

The Figma file remains authoritative about what the design looks like, and `spec.md` references it.
It is an input to the specification, not the specification.

[flow.md](flow.md) is the lifecycle; [gates.md](gates.md) is what each stage must prove.

## Four kinds of file

Every file here is one of four things. Confusing them is the failure this method exists to prevent,
so it is worth being able to say which is which without thinking.

| Kind              | What it is                                   | Examples                                       | Editable                     |
| ----------------- | -------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| **Spec**          | the source of truth, authored by a person    | `specs/###-feature/spec.md`                    | **yes — only this**          |
| **Derived plan**  | worked out from the spec, human-reviewed     | `plan.md`, `tasks.md`, `research.md`           | yes — regenerating overwrites |
| **Projection**    | a readable rendering of the Figma input      | `figma-tokens.md`, `figma-tokens.json`         | no — regenerated             |
| **Artifact**      | what was built from the spec                 | `tokens.css`, components, stories, `*.feature` | no — regenerated             |

`gen` overwrites projections and artifacts alike; nothing in either survives a regeneration.

**`*.feature` files are artifacts.** Behaviour is specified once, as Acceptance Scenarios inside
`spec.md`; the Gherkin is generated from it. Two authored homes for the same scenarios would be two
specs that disagree, with the real one being the file nobody opened.

**The Figma file is an input, not a spec.** It is authored, and it is authoritative about what the
design looks like — but the specification that governs a change is `spec.md`, which references the
Figma node it depends on. This replaces the earlier arrangement in which the design file *was* the
specification.

**A projection is not a second spec.** It records what the Figma input *says*; the artifact records
what was *generated from it*. Reading the two side by side is the review, and it needs no new
tooling: `Error #ef4444` present in `figma-tokens.md` and absent from `tokens.json` is a finding
visible in a diff.

**Never fix a problem in generated output.** A fix belongs in `spec.md`, in the Figma input, or in
the generator. Editing a projection or an artifact produces a change that the next generation
silently deletes, and — worse — a green build that no longer reflects the spec.

The one caveat the tool has today: `gen` does not delete files it no longer generates, so a variant
renamed in Figma leaves an orphan behind that still compiles. Check `git status` after generating.

## What makes a spec authoritative

A specification is only authoritative if the system continuously proves compliance. Without that,
it is documentation, and documentation drifts.

Three drift checks, each catching something the others cannot:

| Check                              | Catches                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `git diff --exit-code packages/` after regenerating | committed code no longer matches a fresh run     |
| `theme --diff`                     | the theme moved and nobody regenerated; hand-edited tokens |
| e2e against the spec               | the built product drifted from the specified behaviour     |

These must run in CI, not by hand. A drift check that depends on someone remembering to run it is
not a check.

[gates.md](gates.md) enumerates every criterion each stage must prove, with the check behind it —
and marks the ones that have no check yet, so a gate is never claimed on a criterion nobody can run.

## Why not multi-agent

We considered a stage-based orchestrator spawning subagents per role. It is the wrong tool here,
for reasons that are specific rather than aesthetic.

Multi-agent systems earn their cost under three conditions: context pollution, genuine
parallelisation, and specialisation. Working one topic at a time — colour, then typefaces, then
spacing — fails all three:

- **Nothing to parallelise.** One topic at a time is sequential by definition.
- **No context pollution.** A whole topic's context is small and stays relevant for the whole task.
- **Shared write state.** One colour change writes `tokens.css`, `tokens.json`, the token stories
  and every component's `styles.css`. Work that writes shared state must stay in one agent.

Current guidance is explicit that sequential phases of the same work are the wrong boundary to
split on, and that coding workflows in particular are a poor fit because they share context. The
cost is real: multi-agent runs use 3–10x the tokens of a single agent.

So the stages are a **pipeline of commands**, not an agent boundary.

**Where subagents would be right:** read-only fan-out — a readiness sweep across every topic at
once, or the same audit across several repositories. The rule is *fan out on reads, stay single on
writes*, and today the write path is the whole job.

## The constitution

Spec-driven tooling keeps a "constitution": a small set of immutable principles that act as a
persistent contract with the agent. [constitution.md](../.specify/memory/constitution.md) is ours — seven numbered
principles, each with the check that proves it or an explicit `NOT BUILT`.

Every principle worth writing down should map to at least one check that can fail. Compliance is
enforced twice: at the Constitution Check gate during planning, and by automated checks that run on
every change. `plugin.json` staying version-locked
to `ai-plugin/cli/package.json` is the clearest example: a rule stated in prose today, and a
five-line CI check tomorrow.

## Open decision: token format

`tokens.json` is a bespoke format. The W3C Design Tokens (DTCG) specification reached its first
stable version — 2025.10, October 2025 — and is supported by Figma, Sketch, Framer, Penpot,
Supernova and zeroheight, with reference implementations in Style Dictionary, Tokens Studio and
Terrazzo.

Adopting it would give us two things we currently lack a place for: `$description` and aliases, the
standard home for semantic naming, and `$extensions`, the standard home for our own provenance
fields. Not decided yet; recorded here so it is not rediscovered.
