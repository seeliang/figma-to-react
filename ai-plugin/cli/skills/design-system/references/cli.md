# CLI reference

One layer now. `figma2react` reads `design-system.json`, loads the token from `.env` beside it, and
serves a recording rather than spending quota unless the command actually needs the live file.

## Commands

```
figma2react init                       ask for the generate area, write design-system.json
figma2react gen    [figma-url]         generate components
figma2react theme  [figma-url]         the theme, by stage: --audit | (none) | --diff
figma2react audit  [figma-url]         report design-file gaps; --json for machine output
figma2react tokens [figma-url]         print the @theme block
figma2react inspect <figma-url> [--raw]  dump the IR, or the untouched API response
```

The target is optional everywhere except `inspect`: with no argument it comes from
`design-system.json`, which is the whole reason that file exists. Given explicitly, it accepts a
full Figma URL, a bare file key, or `<fileKey>:<nodeId>`; URL-form node ids (`2-77`) convert to API
form (`2:77`) automatically.

The config is found by walking up from the working directory, so the commands work from anywhere in
a workspace.

## Offline is the default for questions, live for changes

The Figma REST quota is set by plan tier and is the binding limit on this kind of work — one or two
calls can lock the API out for hours.

| Command                          | Default     | Why                                                   |
| -------------------------------- | ----------- | ----------------------------------------------------- |
| `audit`, `theme --audit`         | **offline** | a question; a recording answers it                    |
| `theme --diff`                   | **offline** | a question about the committed output                 |
| `gen`, `theme`, `tokens`, `init` | **live**    | generating from a stale recording produces stale code |
| `inspect --raw`                  | **live**    | this is how a recording gets made                     |

`--offline` and `--live` override either way. Offline needs `offline.fixture` in the config, pointing
at a response recorded with `inspect --raw`; the path resolves relative to the config, not the
working directory. Every run says which mode it is in on stderr — read it.

## Config-driven defaults

`gen` and `theme` take `traceIds`, `stories`, `fidelityThreshold` and `minUses` from the config's
`gen` block, and the output directory from `out`. A flag you actually type always wins.

**These defaults apply only when the config describes the target being generated.** Point `gen` at
some other Figma file and it runs on its own defaults — inheriting another design system's flags
would be an ambush, not a convenience.

## `gen` flags worth knowing

| Flag              | Why it matters                                                           |
| ----------------- | ------------------------------------------------------------------------ |
| `--trace-ids`     | emits `data-figma-id`; **the fidelity check asserts nothing without it** |
| `--stories`       | writes `*.stories.tsx` and `figma-geometry.json`                         |
| `--layer <name>`  | generates into a subdirectory of `out`, so one layer is reviewable alone |
| `--dry-run`       | prints the write plan and touches nothing                                |
| `--config <file>` | where layers and ownership come from; defaults to `design-system.json`   |

## What `gen` writes

```
<out>/
  design-system.tsx        the root frame
  button-primary-hover.tsx one file per component variant
  button.stories.tsx       one per variant set, with --stories
  theme.stories.tsx        every token as a swatch, with its own assertions
  figma-geometry.json      what the fidelity check measures against
  fonts.css                must be imported before anything else
  tokens.css               the :root block of CSS custom properties
  tokens.json              the token manifest `theme --diff` compares against
```

`gen` does **not** delete files it no longer generates. When a variant is renamed in Figma the old
file stays behind and still compiles. Check `git status` after generating and remove orphans — this
is a known gap in the tool, not something you should have to remember forever.

## Errors

- **`Figma rate limit exceeded`** — the quota, not a bug. The message names when it resets. Use
  `--offline` until then, and say that the output reflects the recording.
- **`Figma returned no node <id> in file <key>`** — wrong node id, or the token cannot read it.
- **`No Figma token`** — put `FIGMA_TOKEN` in `.env` beside `design-system.json`, or pass `--token`.
- **`Nothing to serve offline`** — no `offline.fixture` in the config. Record one with
  `inspect --raw`.

Everything exits `1`; there are no per-error codes.
