# Docs

This project uses **spec-driven development, spec-first**, via
[GitHub Spec Kit](https://github.com/github/spec-kit) v1.0.4. An authored specification is the
source of truth; code is a generated, verifiable artifact.

| Doc | What it is |
| --- | ---------- |
| [constitution.md](../.specify/memory/constitution.md) | **law** — seven numbered principles, each with the check that proves it |
| [flow.md](flow.md) | **lifecycle** — the seven stages and the skill that runs each |
| [gates.md](gates.md) | **proof** — what each stage must prove, and whether it can yet |
| [ai-solution.md](ai-solution.md) | **rationale** — why the method is shaped this way |

## Starting work

Every change is a numbered feature, including a token refresh.

```
/speckit-specify    → specs/###-name/spec.md   (and a ###-name branch)
/speckit-clarify    → resolve ambiguity, encode answers back
/speckit-plan       → plan.md, and the Constitution Check
/speckit-tasks      → tasks.md
/speckit-implement  → source, tokens, stories
/speckit-analyze    → consistency and constitution alignment
```

**Do not run `/speckit-constitution`** — it would rewrite the constitution and drop the
per-principle Check lines. Amend that file by hand.

## The rule that survives every stage

**Never fix a problem in generated output.** The fix belongs in `spec.md`, in the Figma input, or in
the generator. Editing the artifact produces a change the next generation deletes — and a green
build that no longer reflects the spec.

It is constitution **P3**, repeated here because breaking it silently invalidates everything
downstream.
