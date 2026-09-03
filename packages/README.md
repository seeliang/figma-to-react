# packages/

What the design system **ships** — `@ds/theme`, `@ds/atoms`, `@ds/molecules`, `@ds/organisms`,
generated from the Figma file and versioned independently.

Empty until those land, which is the honest state: nothing ships yet.

Anything used to _produce or verify_ the design system rather than to consume it — the generator,
the build presets, the test assertions — lives in `tools/` and is scoped `@figma-to-react/*`.
The rule is one line: **if a consumer would install it, it belongs here.**
