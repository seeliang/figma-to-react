# Flow

> Spec-driven stage: **all of them** — this is how the pipeline is run, in order.
> [gates.md](gates.md) says what each stage must *prove*; this says what each stage *does*.
> See [ai-solution.md](ai-solution.md) for why the method is shaped this way.

## The standard lifecycle

Microsoft's [Spec-Driven Development: AI-Native Engineering][ms] defines SDD as "a spec-first
approach" where "teams define common guardrails, requirements, constraints, acceptance criteria, and
edge cases up front, then use AI to generate code, tests, and supporting artifacts from that shared
context."

It gives the GitHub Spec Kit lifecycle as seven stages:

1. **Constitution** – "Define principles, standards, and guardrails."
2. **Specify** – "Capture requirements, scenarios, and acceptance criteria."
3. **Clarify** – "Resolve ambiguity, dependencies, and edge cases."
4. **Plan** – "Translate intent into architecture, flows, and constraints."
5. **Tasks** – "Break the work into implementation-ready units."
6. **Implement** – "Use AI to generate and refine code and tests."
7. **Validate** – "Verify that the output matches the spec."

The problem it names is *translation loss* at four handoffs: "Stakeholder needs to product
requirements; Requirements to architecture and design; Design to implementation; Implementation to
validation and release."

We keep the lifecycle. We remove two of those handoffs, because the design file crosses them without
a translation step.

## How ours maps

| Spec Kit stage   | Here                       | What runs it                             | Writes                       |
| ---------------- | -------------------------- | ---------------------------------------- | ---------------------------- |
| **Constitution** | Constitution               | [architect.md](architect.md) + CI checks | nothing — checks fail        |
| **Specify**      | Specify                    | Figma; `*.feature` files                 | the spec itself, by hand     |
| **Clarify**      | **Gate**                   | `figma2react audit`                      | nothing — reports            |
| **Plan**         | *folded into Constitution* | —                                        | —                            |
| **Tasks**        | *the audit's findings*     | `figma2react audit`                      | nothing — printed, not filed |
| **Implement**    | Generate                   | `figma2react gen`                        | projections + artifacts      |
| **Validate**     | Verify                     | CI: drift, parity, e2e                   | nothing — checks fail        |

Only two rows write. That is the shape of the method: one stage authors the spec, one stage generates
from it, and everything else reads and reports.

## Running it

### 1. Constitution — set the guardrails once

[architect.md](architect.md) is ours: pure CSS, tokens as custom properties, shallow structure,
skills versioned with the CLI.

There is no constitution *gate*. Every principle worth writing down should map to a check that can
fail on every change, so it is enforced continuously rather than reviewed periodically. A principle
with no check is a principle that will be broken quietly — the same standard
[gates.md](gates.md) holds every criterion to.

### 2. Specify — the design file, and the scenarios

Two specs, both authored by a person, and the only files anyone edits:

| Spec            | Covers     | Lives in                      |
| --------------- | ---------- | ----------------------------- |
| The Figma file  | appearance | Figma                         |
| BDD `*.feature` | behaviour  | beside the code it constrains |

This is where we drop a handoff. Spec Kit has you *author* requirements in prose, then translate them
into design. The designer already works in a machine-readable artifact, so the design file **is** the
requirements document — there is no prose to write and no second document to keep in sync.

Write scenarios **before** the code. A test written afterwards documents what was built; one written
first specifies what should be.

### 3. Gate — `figma2react audit`

Spec Kit's Clarify resolves ambiguity in prose. A structured spec cannot be ambiguous, but it can be
**incomplete** — a colour bound to no Style has no name to generate from; a hover state nobody
designed cannot be invented. So Clarify becomes a mechanical completeness check:

**Developer Ready means the spec is complete enough to generate from.**

The audit reads and reports; it writes nothing. That is deliberate — it is offline and free by
default so it can be run before every change, and a gate that mutates cannot be run speculatively.

Its findings are the task list. Each names the Figma action that fixes it, and the list is
regenerated every run rather than committed, because a filed checklist goes stale the moment the
design moves.

A gap here is a **Figma action, never a code patch**. Hard-coding a value nobody chose hides an
incomplete spec instead of completing it.

**Passed when:** every criterion in [gates.md](gates.md) § Specify has a passing check — filed there
under *Specify* rather than *Gate*, because what they test is the spec's completeness, not the
audit's behaviour. Four have no counterpart in Figma yet, and `NOT BUILT` blocks the claim rather
than passing quietly.

### 4. Generate — `figma2react gen`

The only stage that writes. It produces **projections** (`figma-tokens.md`, `figma-tokens.json` —
what the design file says) and **artifacts** (`tokens.css`, components, stories — what was built from
it). Neither survives the next run.

**Never fix a problem in generated output.** The fix belongs in the design file or in the generator.
Editing the output produces a change the next generation deletes, and a green build that no longer
reflects the design.

Reading the projection against the artifact **is** the review, and it needs no tooling: a colour
present in `figma-tokens.md` and absent from `tokens.json` is a finding visible in a diff.

Check `git status` afterwards — `gen` does not delete files it no longer generates, so a variant
renamed in Figma leaves an orphan behind that still compiles.

**Passed when:** [gates.md](gates.md) § Generate is satisfied. Note what it admits — parity currently
runs on zero components, and the duplicate-property check is warn-only.

### 5. Verify — prove it still matches

Drift checks, parity, accessibility and supply chain, enumerated in
[gates.md](gates.md) § Verify.

These run in CI. **A drift check that depends on someone remembering to run it is not a check** —
without continuous proof a specification is documentation, and documentation drifts. Today there is
no `.github/`, so this stage is intent rather than enforcement.

**Drift sends you back to Specify, not to a patch.** That is the loop in the pipeline diagram, and
following it is the whole discipline.

## Where we deliberately differ

**No Plan stage.** Spec Kit plans architecture per feature. Here architecture is not per-feature —
every component comes out of the same generator under the same standing constraints, so a
per-feature plan document would re-decide settled things. When architecture genuinely changes it
changes [architect.md](architect.md): one file, reviewed once, enforced by checks.

**No `tasks.md`.** The audit prints the task list fresh each run. Committing it turns a live gate
result into a stale file people edit.

**No prose spec.** A file named `spec.md` reads as authoritative and invites editing, and once edited
there are two specs that disagree — with the real one being the file nobody opened. The reasoning is
in [ai-solution.md](ai-solution.md); the resulting layout is in [architect.md](architect.md).

## Right-sizing

The article's own advice is to "treat specs as living artifacts, avoid over-specifying too early, and
expand the workflow only where it adds clear value." That is the argument for all three differences
above, and for five stages rather than seven.

It is also why the stages are a **pipeline of commands, not an agent boundary**. Sequential phases of
one job that share write state are the wrong thing to split across agents; the roles in `docs/` are
responsibilities, not processes.

[ms]: https://developer.microsoft.com/blog/spec-driven-development-ai-native-engineering/
