---
name: ds-design-review
description: 'Reviews the Figma design file behind the design system and reports what is missing in the file itself — unbound colours, components not sorted into atomic layers, missing Auto Layout, absent interaction states — each with the Figma action that fixes it. This is the Developer Ready gate. Use when asked whether the design is ready for development, what the design file is missing, why token names look synthesised, or how components should be sorted into atoms, molecules and organisms.'
allowed-tools:
  - Read
  - Bash(figma2react audit*)
  - Bash(npx figma2react audit*)
  - Bash(cat design-system.json)
---

# Design review

Reports gaps in the **Figma file**, not in the code. Every finding names a Figma action, because
no amount of code can invent information that was never put in the file.

## When to use

"Is this ready for dev?" · "what is the design system missing?" · "why is it `--color-blue-600`
and not `--color-primary`?" · "which layer is this component?" · before starting work against a
frame.

## Steps

1. **Run the audit.**

   ```
   figma2react audit
   ```

   Takes the target from `design-system.json`, so no URL is needed. Offline by default, against
   the recorded response — no quota spent. Add `--live` only when the
   question is specifically whether the _current_ file has changed, and say that you are doing it.
   Add `--json` when you need to reason over the findings rather than relay them.

2. **Lead with the layers.** The command prints them first. Report which components are sorted,
   from where (`section`, `prefix` or `override`), and which are not. For unsorted ones, give the
   suggestion _and its evidence_ — "Button → atom (1 element, no nested components, 360px of
   1546px)" — so the reader can agree or disagree rather than just accept.

   Where the suggestion is absent because the signals conflict, say so and ask. Do not pick.

3. **Report the findings by severity**, `high` first. For each: what it costs in the generated
   code, and the Figma action. Keep the tool's own wording for the action — it is specific about
   which Figma feature applies on which plan.

4. **Separate design issues from tool bugs.** If something in the output looks wrong and the
   design file explains it, that is a design issue. If the file has the information and the
   generator dropped it, that is a bug — say so plainly and offer to fix it in code.

## Reporting

Give the gate verdict first, then the detail:

> **Not Developer Ready** — 2 high findings.
>
> Layers: Button and Input Field are atoms, Form Field is a molecule, all three from
> `design-system.json` rather than from Figma sections.
>
> 1. **62 colours bound to no Style or Variable** — token names are synthesised, so you get
>    `--color-blue-600` where you want `--color-primary`. Fix: create Colour Styles in Figma.
>    Style names ship on every plan; Variable names need Enterprise.

Never propose a code change for a design finding. "Add `aria-label` to silence this" is the wrong
answer to a layer that should be renamed; "hard-code the hover colour" is the wrong answer to a
hover state nobody designed.

## What this cannot see

- **Variable names** — Enterprise only. A colour bound to a Variable is correctly bound, but its
  name is unavailable, so it groups by id rather than by name.
- **Anything outside the configured node.** The review covers the frame in `design-system.json`.
- **Whether the design is any good.** It checks that the file carries what code generation needs,
  which is a different question from whether the design works.
