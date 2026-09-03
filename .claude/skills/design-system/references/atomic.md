# Atomic layers

Three layers — **atoms, molecules, organisms** — with the **theme** held separately. Templates and
pages are not layers here. Source:
[Implementation of atomic design](https://seeliang.medium.com/implementation-of-atomic-design-67301cb0e09b).

## The checklist

| Layer        | Structure                                                              | May include                 |
| ------------ | ---------------------------------------------------------------------- | --------------------------- |
| **atom**     | one element, no internal functions                                     | nothing                     |
| **molecule** | more than one element, **not** edge to edge                            | molecules, atoms            |
| **organism** | spans the full width, sits at root level as a direct child of the page | organisms, molecules, atoms |

Stacked organisms make a page. The theme is colours, spacing and breakpoints — the configuration
every layer resolves against.

## Scope

A component owns its **padding**; its **parent** owns the space around it. This is what lets a
component be included as a whole rather than tweaked at each call site.

The failure mode, from the article: a layer inside `molecule-0` named `organism-a__element`. The
grandparent is reaching through the molecule to style one of its parts, so `molecule-0` can no
longer be dropped into anything else unchanged. Two fixes — move the element out into the
component that names it, or rename it to the molecule's own namespace and drive the difference
with a prop.

Detected as `mixed-scope`, and as `scope-size-override` when an instance is resized away from its
master.

## Where the layer comes from

Resolved in this order, and **never inferred**:

1. an enclosing Figma section named `Atoms` / `Molecules` / `Organisms`
2. a layer-name prefix — `atom/Button`
3. `atomic.layers` in `design-system.json`
4. nothing → `layer-unclassified`, a high finding

The file is consulted before the config on purpose: sorting is a decision the designer and
developer make together, and the article's own retrospective is that getting it wrong cost days of
refactoring. The config is the fallback for what the file cannot express.

**The CLI suggests, it does not decide.** `figma2react init` and `audit` both print a suggested
layer with its evidence — element count, nested components, width against the frame. When the
signals disagree (one element, but spanning the frame: an atom by structure, an organism by
width) it offers no suggestion and asks. Record a layer only after a person confirms it.

Element counting mirrors what the emitter produces, not what Figma holds: a frame whose only child
is a text layer collapses to a single `<button>` or `<input>`, which is why an Input Field is an
atom and not a two-element molecule.

## Ownership

Orthogonal to the layer, declared in `design-system.json`:

- **specific** — one-time, for a single template; lives with the team that built it
- **private** — one team, used repeatedly; lives in that team's repo
- **public** — used across the organisation; the shared package

Only public components belong in the shared package. Components move between the three, which is
why it is worth stating.

## The checks

`layer-unclassified` · `layer-dependency-violation` · `scope-size-override` · `mixed-scope` ·
`atom-multi-element` · `organism-not-full-width` · `molecule-full-width` · `unowned-component` ·
`no-breakpoints`
