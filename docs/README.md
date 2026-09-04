# Docs

Start with **[ai-solution.md](ai-solution.md)** — the methodology and the reasoning behind it.
Then **[flow.md](flow.md)** — how to run it stage by stage, mapped against the industry-standard
seven-stage lifecycle. Everything else is one stage of that method.

## The pipeline

Spec-driven development: the Figma file is the specification, code is a generated artifact, and
automated checks prove the two still agree.

```
constitution ──▶ specify ──▶ gate ──▶ generate ──▶ verify
                    ▲                                 │
                    └──────── drift sends it back ────┘
```

| Stage            | What happens                                            | Doc                                    |
| ---------------- | ------------------------------------------------------- | -------------------------------------- |
| **Constitution** | principles every change obeys, enforced continuously    | [architect.md](architect.md)           |
| **Specify**      | appearance in Figma; behaviour as BDD scenarios         | [design.md](design.md) · [QA.md](QA.md) |
| **Gate**         | is the spec complete enough to generate from?           | [design.md](design.md)                 |
| **Generate**     | spec → React, tokens, stories                           | [develop.md](develop.md)               |
| **Verify**       | prove the artifact still matches the spec               | [QA.md](QA.md) · [design.md](design.md) |

[flow.md](flow.md) walks all five in order — the command that runs each stage, what it reads and
writes, and how the five map onto the industry-standard seven-stage lifecycle.

**What each stage must prove is in [gates.md](gates.md)** — every criterion stated so it can fail,
with the check that proves it and whether that check exists yet. The role docs say who owns a stage;
`gates.md` says when it is passed.

## Why two docs appear twice

`design.md` and `QA.md` each own a stage at both ends, and that is the method working rather than
an overlap to tidy away:

- **Design** sets the spec (`design audit`) and later confirms the built product matches it
  (`verify product`). Same person, same source of truth, two ends of the pipeline.
- **QA** writes the behaviour spec (`BDD`) *before* the code and checks it *after*. A test written
  afterwards documents what was built; one written first specifies what should be.

## The rules that survive every stage

Both are argued in [ai-solution.md](ai-solution.md); they are repeated here because breaking either
one silently invalidates everything downstream.

1. **Never fix a problem in generated output.** The fix belongs in the design file or the
   generator. Editing the artifact produces a change the next generation deletes.
2. **A gap in the design file is a Figma action, never a code patch.** Hard-coding a value nobody
   chose hides an incomplete spec instead of completing it.

## Roles are responsibilities, not processes

The docs are named by role because that is who owns each stage. They are not four independent
tracks — the pipeline is sequential, and the gate exists so problems surface while they are still
cheap. A naming change caught at verify is already a breaking change to code that was written.
