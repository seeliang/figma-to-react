# Theme

Colours, spacing and breakpoints — the configuration every atom, molecule and organism resolves
against. Two generated files (`tokens.css`, `fonts.css`) plus a machine-readable `tokens.json`.

## This design system is hand-tailored

**Tailwind's palette is not the target and is not an oracle.** The synthesised names look like
Tailwind's (`blue-600`, `slate-400`) because they are derived from the same kind of ramp, but
agreeing with Tailwind is not a goal and must never be asserted in a test. Doing so would generate
churn in service of somebody else's vocabulary.

For the record, they often _disagree_: `#e2e8f0` is emitted as `blue-200` where Tailwind calls it
`slate-200`, and `#64748b` as `slate-600` where Tailwind calls it `slate-500`. That is not a bug to
fix by recalibrating the ramp.

**A derived name is a fallback, and a fallback is all it can be.** `--color-slate-600` describes a
colour; it cannot say what the colour is _for_. The fix for a name you dislike is a Figma Colour
Style — bind one and the derived name is never used again. Not a better naming rule.

## What the naming actually promises

Three things, and these _are_ asserted (`packages/core/test/tokens.test.ts`):

- the same colour always yields the same name, so `git diff` on the output is a signal about the
  design rather than noise about the generator
- no two tokens share a custom property
- one name never carries two values

## Priority order

1. **Figma Colour Style** — `Surface/Raised` → `--color-surface-raised`. Style names ship on every
   plan. This is the one to reach for.
2. **Figma Variable** — correctly bound, but the name needs Enterprise. Grouped by id, named from
   the value, so it still counts as _derived_.
3. **Frequency** — used `minUses` times or more, named from the colour itself.

`tokens.json` records which applied, per token, as `named: true | false`.

## Known collision

An app may import several `@theme` blocks and Tailwind resolves a repeated property by import
order. Two design files that both synthesise `--color-blue-600` therefore silently agree on one
value, and the loser renders wrong with the build still green.

This is live in `examples/`: the card fixture declares `#2663eb`, the design system `#2563eb`, and
the design system wins. `scripts/verify-tokens.mjs` reports it by name. Fixing it properly means
namespacing a whole theme through to class names — not done.

## Not versioned here

**NX and CI own versioning.** No semver, no changelog, no release command in this repo. When asked
about theme releases, say so rather than inventing a second answer.
