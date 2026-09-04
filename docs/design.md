# Design

> Spec-driven stage: **specify** and **gate**, then **verify** at the end.
> See [README.md](README.md) for the pipeline, [ai-solution.md](ai-solution.md) for why.

design involve in two stage

## design audit

Verify the design file is complete and carries every token development needs.

This is the gate, so it reads and reports and writes nothing — that is what makes it safe to run
before every change.

Development reads the design's tokens without opening Figma through a **projection**,
`packages/theme/src/figma-tokens.md`. `gen` writes it, not the audit; the audit reads it. It is
regenerated every run and is not a second spec: never edit it, and a wrong value in it is a Figma
fix, not a file fix.

## Verify Product

Use e2e to check the built product is align with design

Gate criteria for the stages design owns: [gates.md](gates.md) — *Specify*, and the
design-parity rows under *Generate*.
