---
name: ds-color
description: "Refreshes the design system's colours from Figma under two rules: colour is a one-to-one copy of the design, and every colour ships as a `--color-[name]` CSS custom property named after the design. Use when the request is about colours specifically — pulling in a palette change, why a colour is missing or merged, why a token is called `blue-600` instead of `primary`, or applying a colour refresh."
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(figma2react theme*)
  - Bash(figma2react audit*)
  - Bash(npx figma2react *)
  - Bash(git diff *)
  - Bash(git status *)
---

# Colour

Colour has two rules. They are not style preferences — they are what makes generated colour worth
committing, and every instruction below exists to hold one of them.

> **1. Colour is a one-to-one copy.** Every colour the design binds becomes exactly one CSS custom
> property. Not fewer — nothing merges, nothing is dropped. Not more — nothing is invented.
>
> **2. Every colour ships as `--color-[name]`,** where `[name]` is the design's own name for it.

A colour the design did not choose must never appear, and a colour the design did choose must never
go missing. Both failures are silent, and both look like working output.

## The command

```
figma2react theme color            # preview: what the refresh would write
figma2react theme color --apply    # write it
```

The preview is offline and costs no quota, so run it first, always. `--apply` refuses to write
while any colour is unbound — that refusal is rule 2 being enforced, not an error to work around.

For the wider theme — typefaces, spacing, breakpoints, the delivery stages — use `ds-theme`. This
skill is colour only.

## Rule 1 — check it before reporting anything

The count is the check, and it is the one thing a per-colour review will not catch:

**distinct colour variables bound in Figma == `--color-*` properties in `tokens.css`**

When those disagree, colour is not a copy any more, and the difference is the whole finding. Three
things cause it, and the Figma action differs for each.

### Two variables share one value → they merge into one token

The REST API returns a bound colour as an opaque id with **no name attached**. With no names, the
value is the only thing left to group by, so two variables holding the same hex become
indistinguishable and collapse into a single property.

This is the most damaging of the three, because the output still looks complete. Two semantic
colours that must diverge later — a fill and the focus ring that happens to match it today, a
surface and a card — become one token, and dark mode cannot separate them afterwards.

**Figma action:** give the two variables distinguishable values, or accept that they are genuinely
one colour and delete one. If they must share a value _and_ stay separate, they need names, which
is rule 2.

### A bound swatch was flattened to a vector → no token at all

A flattened or outlined shape is exported as an SVG, and its fill is baked into the export rather
than collected. The variable is bound correctly and still produces nothing.

Suspect this when one colour of a set is missing while its siblings came through — flattening is
usually accidental, and it usually hits one shape rather than a row.

**Figma action:** un-flatten the shape so it is a plain ellipse or rectangle again.

### The palette names a colour but the components use raw hex → the name never applies

Check this separately, and expect it to be the largest gap. A colour can be documented, named and
bound in the palette while nearly every _usage_ of it in the components is a raw hex value that
references no variable at all.

Those usages carry no source, so they are grouped by value and named by frequency — the palette's
name never reaches them, and any usage below `minUses` is inlined as a literal instead of becoming
a property. Count bound versus unbound usages **outside** the documentation frame; a palette that
is fully bound while the components are not is a palette documenting a vocabulary nothing speaks.

**Figma action:** bind the components' fills and strokes to the variables, not only the swatches.

### A colour is bound to nothing → derived, or dropped

An unbound colour has no name to carry, so it is named from its own value, and only earns a token
at all once it appears `minUses` times. Below that threshold it is inlined and never reaches the
theme.

**Figma action:** bind it. This is the same fix as rule 2.

## Rule 2 — `--color-[name]` comes from the design, in this order

1. **A Figma Colour Style.** `Surface/Raised` → `--color-surface-raised`. Style names come through
   on every plan. This is the one to reach for, and it needs nothing else.
2. **A bound documentation swatch.** Where the file documents its own palette — a frame of swatches
   with labels — binding each swatch to the variable it documents joins label to variable **by id**.
   Exact, and the only route that survives two variables sharing a value.
3. **An unambiguous documentation swatch, joined by value.** Where the swatch is _not_ bound, its
   value may still name the colour — but only when that value appears in **exactly one** palette
   cell **and** is held by **exactly one** variable. Both halves are required.
4. **Derived from the value** — `--color-blue-600`. The fallback, and only ever a fallback.

`tokens.json` records which applied, per colour, as `named: true | false`.

**Never loosen rule 3.** A value join across two cells, or across two variables holding one hex,
names one of them confidently and wrongly — and a wrong name on the public API is worse than an
obviously derived one. A brand colour and the focus ring that happens to match it today are the
usual pair. When either half fails, ask; do not pick.

### Read the layer name, not just the visible label

A palette cell carries two names: the **text it displays** and the **name of the cell layer
itself**. They are often not the same, and the layer name is usually the better one — a cell
labelled `Neutral-64` may sit on a layer called `Muted`, and `Muted` is the name worth shipping.

Prefer the layer name; fall back to the displayed text. Check both before reporting that a palette
has no real names in it — the roles are frequently already there, one level up.

A derived name describes a colour; it cannot say what the colour is _for_. A label derived from the
hex — `neutral-0f`, `gray-64` — reads like a name but carries exactly as much meaning as the
derived name it was meant to replace. The name has to say the role: `primary`, `border-focus`,
`surface`, `muted-foreground`.

### Naming and un-merging are different problems

Worth stating plainly, because fixing one looks like fixing both:

- A **name** decides what the property is called: `--color-primary` rather than `--color-blue-600`.
- **Binding** decides how many properties there are.

Two variables holding one hex stay merged no matter how good the palette label is, because the
label names the _colour_ and only the binding names the _variable_. Naming alone will make a merged
token look correct while still being one property where the design has two — the worst of the
outcomes, because it no longer looks wrong.

## Reporting

Every cause above is fixed in Figma, not in code. Name the Figma action; never invent the missing
colour, never widen `minUses` to force a dropped colour through, and never hand-edit `tokens.css`
— it is overwritten on the next run.

Keep the two kinds of finding apart:

- _"`#ffffff` is one token because two variables hold it and neither is named"_ — design issue.
- _"a bound variable produced no token"_ — worth checking against the causes above before calling
  it either; a flattened swatch is a design issue, anything else is a tool bug.

State the count you checked, not just the colours you looked at. "11 colours bound, 9 properties
emitted, 2 lost to a shared value" is the finding; a list of colours that look right is not.

### Generating from a section copies the canvas, not the design

A Figma **section** has its own background and border — editor furniture, not a design decision.
Generate from a section and they are faithfully copied onto the root wrapper, so a colour appears
in the output that nobody chose. It is not a tool bug; the paint really is declared on the node.

**Fix:** point the config at the frame inside the section rather than at the section. This usually
clears an Auto Layout finding at the same time, since sections do not have Auto Layout.
