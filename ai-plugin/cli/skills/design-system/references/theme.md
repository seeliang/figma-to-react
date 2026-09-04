# Theme

Colours, spacing and breakpoints — the configuration every atom, molecule and organism resolves
against. Four generated files: `tokens.css` for the browser, `fonts.css` for the typefaces,
`tokens.json` for tooling, and `figma-tokens.md` for a person.

## Colors

for handle current colors generation

1. make 1 to 1 copy of the design, including reuse and repeat components in the design
2. add css var name like "--color-primary" to the design
3. create related vars in css file
4. read `figma-tokens.md` — rewritten each run — and act on what the design left unbound

## The token reference

`theme` writes `figma-tokens.md` beside the generated files, every run.

It records the **design**, and only the design: the swatches the file documents, in the file's own
groups and order, with the name each one displays, its value, and the Variable behind it — or that
none is. Then radius, spacing and typography on the same terms.

**It carries no implementation reference.** No custom property names, no output filenames, no
token counts. That is the constraint that makes it useful rather than a second copy of the
generated output: it is the record of the _input_, and the one document that can still describe a
colour the design defines and the generator never emitted. The generator's own tests fail if an
implementation detail leaks into it.

It is regenerated on every `theme` run from the same response the theme was generated from, so it
cannot drift and is never written by hand.

### What it makes visible

Things that are true of the design and invisible from inside Figma:

- a swatch **flattened to a vector** — bound correctly, and unable to produce a token
- two swatches **sharing one value**, which nothing downstream can tell apart
- a scale **defined but never applied** — spacing variables that exist while no frame references
  them, which looks identical to a correct file in the editor
- a type size that is **not bound**, so it can only ever be emitted inline

Each is a design issue. Name the Figma action that fixes it; none of them is fixed in code.
