# AI solution: spec-driven development

## The decision

This project uses **spec-driven development**. The Figma file is the specification; the React
code is a generated, verifiable artifact.

This is a named industry methodology, not a local invention. Its standard definition — *a precise,
executable specification is the source of truth, and code is a generated, verifiable artifact* —
describes what this repository already does. Naming it matters: it tells us which problems are
already solved elsewhere, and which decisions below are forced rather than chosen.

[flow.md](flow.md) does that comparison in full — the lifecycle as the industry states it, which
stages we run, and which two we remove because the design file crosses those handoffs without a
translation step.

## Why the design file is the spec

Mainstream spec-driven tooling has you *author* a specification in prose — requirements, then
design, then tasks — which an agent turns into code. Those are GitHub Spec Kit's **Specify**,
**Plan** and **Tasks** stages, quoted in [flow.md](flow.md). We skip that step, because the design
file is already both machine-readable and the artefact the designer actually works in.

That makes our variant the stronger form. There is no second document to keep in sync with the
first, and no prose-to-code ambiguity, because the spec is not prose.

The cost is stated plainly under [Where the spec runs out](#where-the-spec-runs-out): a Figma file
can only express what Figma has a field for.

## Two specs, one discipline

Appearance and behaviour are specified separately, and both are executable:

| Spec           | Covers     | Generated from it                                            |
| -------------- | ---------- | ------------------------------------------------------------ |
| The Figma file | appearance | components, `tokens.css`, token stories, `figma-tokens.md`   |
| BDD scenarios  | behaviour  | tests, coverage                                              |

BDD is not a separate methodology bolted on. It is the same idea — an executable specification
that the system continuously proves it satisfies — applied to behaviour rather than appearance.
Read [develop.md](develop.md) and [QA.md](QA.md) as the behaviour half of this document.

## Three kinds of file

Every file here is one of three things. Confusing them is the failure this method exists to prevent,
so it is worth being able to say which is which without thinking.

| Kind           | What it is                                    | Examples                                    | Editable            |
| -------------- | --------------------------------------------- | ------------------------------------------- | ------------------- |
| **Spec**       | the source of truth, authored by a person     | the Figma file; BDD scenarios (`*.feature`) | **yes — only this** |
| **Projection** | a readable rendering of what the spec says    | `figma-tokens.md`, `figma-tokens.json`      | no — regenerated    |
| **Artifact**   | what was built from the spec                  | `tokens.css`, components, stories           | no — regenerated    |

`gen` overwrites projections and artifacts alike; nothing in either survives a regeneration.

The Figma file lives in Figma; the other spec needs a path, so BDD scenarios are `*.feature` files
sitting **beside the code they constrain** — `packages/theme/src/color.feature`, not a `specs/`
directory off the root. That keeps a topic's specification, implementation and tests together, and
it makes the rule visible in a directory listing: under `packages/`, `.feature` files are the only
files a person writes. Everything else there is regenerated.

**A projection is not a second spec.** It records what the design file *says*; the artifact records
what was *generated from it*. Reading the two side by side is the review, and it needs no new
tooling: `Error #ef4444` present in `figma-tokens.md` and absent from `tokens.json` is a finding
visible in a diff.

**Do not generate a document called a spec.** A file named `spec.md` reads as authoritative and
invites editing — and once edited there are two specs that disagree, with the real one being the
file nobody opened. The whole advantage of a design file as the spec is that there is no second
document to keep in sync. Name a projection a projection.

**Never fix a problem in generated output.** A fix belongs in the design file, or in the generator.
Editing a projection or an artifact produces a change that the next generation silently deletes,
and — worse — a green build that no longer reflects the design.

The one caveat the tool has today: `gen` does not delete files it no longer generates, so a variant
renamed in Figma leaves an orphan behind that still compiles. Check `git status` after generating.

### Which stage writes

**Gates read and report; they do not write.** `audit` is offline and free by default precisely so it
can be run before every change — a command that writes has to go live and spend Figma quota, and a
gate that mutates cannot be run speculatively.

Projections and artifacts are both written on the **generate** path. A design-review command should
produce a verdict and its findings, reading the projection rather than emitting one.

## What makes a spec authoritative

A specification is only authoritative if the system continuously proves compliance. Without that,
it is documentation, and documentation drifts.

Three drift checks, each catching something the others cannot:

| Check                              | Catches                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| `git diff --exit-code packages/` after regenerating | committed code no longer matches the design file |
| `theme --diff`                     | the theme moved and nobody regenerated; hand-edited tokens |
| e2e against the design             | the built product drifted from the specified behaviour     |

These must run in CI, not by hand. A drift check that depends on someone remembering to run it is
not a check.

[gates.md](gates.md) enumerates every criterion each stage must prove, with the check behind it —
and marks the ones that have no check yet, so a gate is never claimed on a criterion nobody can run.

## Where the spec runs out

A Figma file can only carry what Figma has a field for. A colour bound to no Style has no name to
generate from; a hover state nobody designed cannot be invented.

So the spec needs a completeness check ahead of generation, and that is what `figma2react audit`
is: **Developer Ready means the spec is complete enough to generate from.** It is the same gate
every spec-driven workflow has, and it belongs before code is written, not after.

This produces the second standing rule:

**A gap in the design file is a Figma action, never a code patch.** Hard-coding a colour nobody
chose does not fix an incomplete spec — it hides one, and it moves the source of truth out of the
design file and into code where no designer will ever find it.

See [design.md](design.md) for the audit stage in the designer's terms.

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

So the stages are a **pipeline of commands**, not an agent boundary, and the roles in `docs/` are
responsibilities, not processes.

**Where subagents would be right:** read-only fan-out — a readiness sweep across every topic at
once, or the same audit across several repositories. The rule is *fan out on reads, stay single on
writes*, and today the write path is the whole job.

## The constitution

Spec-driven tooling keeps a "constitution": a small set of immutable principles that act as a
persistent contract with the agent. [architect.md](architect.md) is ours.

Its constraints should be enforced continuously rather than reviewed periodically — the industry
has moved from architecture review gates to automated fitness functions, and every principle worth
writing down should map to at least one check that can fail. `plugin.json` staying version-locked
to `ai-plugin/cli/package.json` is the clearest example: a rule stated in prose today, and a
five-line CI check tomorrow.

There is no architecture *gate*. There are architecture *checks*, and they run on every change.

## Open decision: token format

`tokens.json` is a bespoke format. The W3C Design Tokens (DTCG) specification reached its first
stable version — 2025.10, October 2025 — and is supported by Figma, Sketch, Framer, Penpot,
Supernova and zeroheight, with reference implementations in Style Dictionary, Tokens Studio and
Terrazzo.

Adopting it would give us two things we currently lack a place for: `$description` and aliases, the
standard home for semantic naming, and `$extensions`, the standard home for our own provenance
fields. Not decided yet; recorded here so it is not rediscovered.

## The roles

Responsibilities, not stages that run independently:

- [architect.md](architect.md) — the constitution
- [design.md](design.md) — spec completeness, and verifying the product against the spec
- [develop.md](develop.md) — implementation against BDD
- [QA.md](QA.md) — behaviour, accessibility, coverage, security
