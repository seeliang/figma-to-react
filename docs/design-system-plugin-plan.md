# Phase 2a — make `ai-plugin/cli` a Claude Code plugin: md and exec in one scope

Runs before [Phase 2b](design-system-packages-plan.md), which resumes at its step 3 once this
lands. Skills background: [design-system-skills-plan.md](design-system-skills-plan.md).

## Context

The four skills in `.claude/skills/` document a tool they don't live with. They sit outside every
package, so a flag rename and its documentation move in separate commits, and NX cannot see a skill
edit as a change to `@figma-to-react/cli` at all. The drift risk is real and currently has no
detector.

Worse, they can't ship. Every command in all four SKILL.md files is `pnpm ds:*` or
`node scripts/ds.mjs *` — and `ds.mjs` is not a thin alias. It holds five things the CLI lacks:
`.env` loading, offline-vs-live policy, the fixture HTTP server, target resolution from
`design-system.json`, and per-command argument shaping. That last one is the sharp edge:
**`pnpm ds:theme --audit` is not a CLI command** — `ds.mjs` rewrites it to `figma2react audit`, and
`--diff` to `theme-diff`. `ds-theme`'s entire stage table is wrapper vocabulary that does not exist
downstream.

`ds.mjs` defends this in its header: those are *"facts about this repo rather than about the tool."*
That argument protects `core` and `emit-*` — a library reaching for ambient files is hard to test.
It does not reach `ai-plugin/cli`, which is a bin. A CLI that reads `.env` and defaults a read-only
command to a recorded fixture is ordinary CLI behaviour, and any consumer on a metered Figma quota
wants both.

**Intended outcome:** `ai-plugin/cli` becomes a self-contained plugin — `skills/` (md) beside `src/`
(exec) — that works as well in a consumer's repo as it does here, with the wrapper's behaviour
folded into the tool and skill-to-CLI drift asserted rather than hoped for.

### Decisions taken

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| Scope        | **Full plugin, including distribution** — manifest, marketplace entry, install path |
| Sequencing   | **Before Phase 2b.** See below — the coupling check says this is safe               |
| Wrapper      | **Folded into the CLI.** `scripts/ds.mjs` is deleted, not kept as a shim            |
| Distribution | **Marketplace entry with an npm source**, not a file copy                           |
| Drift        | **Asserted** by a new `scripts/verify-skills.mjs` in the `verify` chain             |

**Why before Phase 2b.** Only two lines in the skills name paths that 2b step 4 moves —
`ds-generate` step 4 (`examples/src/app.tsx`) and `references/gates.md`
(`git diff --exit-code examples/src/design-system`). Both land in the repo-local half of the split
below, which is small and isolated. Doing this first costs no rework; doing it after means writing
every shipped skill against a CLI surface that is about to change anyway.

---

## The mechanics, verified

A plugin directory holds md and exec together, which is exactly the shape wanted:

```
skills/<name>/SKILL.md        the md
bin/  scripts/                the exec
.claude-plugin/plugin.json    name + version
```

Without a manifest, `skills/` is auto-scanned and the plugin takes its **directory name** — which
would be `cli`. So the manifest is required, only to set `"name": "figma2react"`.

Distribution, confirmed against the marketplace reference:

- `.claude-plugin/marketplace.json` accepts `"source": "./ai-plugin/cli"`, resolved relative to the
  marketplace root (the directory holding `.claude-plugin/`), and must start with `./`.
- It also accepts `{"source": "npm", "package": "@figma-to-react/cli"}` — the consumer path.
- `.claude/settings.json` takes `extraKnownMarketplaces` and `enabledPlugins`; the marketplace is
  added when the user trusts the project folder.

So this repo dogfoods its own distribution: a root marketplace pointing at `./ai-plugin/cli`, enabled in
committed project settings, no manual install step.

---

## The seam

Sorted by what each skill actually invokes:

| Skill              | Invokes                                                          | Home       |
| ------------------ | ---------------------------------------------------------------- | ---------- |
| `design-system`    | nothing — routing, the two rules, `design-system.json` as context | **plugin** |
| `ds-design-review` | `audit`                                                          | **plugin** |
| `ds-generate`      | `gen`, `init` (minus the orphan step — see below)                 | **plugin** |
| `ds-theme`         | `theme --audit` / `--diff` (once those are real commands)         | **plugin** |
| _(new)_ `ds-verify` | `pnpm verify`, `verify-tokens.mjs`, `test-storybook`            | **repo**   |

The router ships. Its content is ~90% tool-domain — the routing table, "name design issues as design
issues", "offline is the default". Only two facts in it are about this repo (Starter tier, the
fixture path), and those move to `ds-verify`.

References split the same way: `atomic.md`, `theme.md` and the tool half of `cli.md` are tool-domain
and ship; `gates.md` is delivery-gate policy and stays. Keeping the router in the plugin also keeps
`ds-theme`'s existing `../design-system/references/theme.md` link intact.

**`ds-generate` step 4 (check for orphans) does not ship.** It is a skill compensating for a missing
`--prune` — a tool gap wearing a skill costume. Move the note to `ds-verify` and leave `--prune` on
the backlog; do not ship a downstream skill that tells consumers to clean up after the tool.

---

## What moves into the CLI

All of `scripts/ds.mjs`, into `ai-plugin/cli/src/`. Guard: `.env` and filesystem discovery go in the bin
entry (`index.ts`) or a new `env.ts`, never in `core` / `emit-*` — the purity argument still holds
for the libraries.

| From `ds.mjs`                                | Becomes                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `loadEnv()`                                  | `ai-plugin/cli/src/env.ts`, resolving `.env` beside the located `design-system.json`                |
| `serveFixture()`                             | `ai-plugin/cli/src/offline.ts` — `ai-plugin/cli/test/e2e.test.ts` already serves this shape; share it   |
| `live` / `READ_ONLY` / `themeWrites()`       | a global `--offline` / `--live`; `audit` and `theme-diff` default offline, writers default live |
| `targetOf(config)`                           | target argument becomes optional everywhere, falling back to config (`audit` already does)      |
| `buildGenArgs()` (`traceIds`, `stories`, …)  | `gen` reads its defaults from `config.gen`; it already takes `--config`                         |
| `theme --audit` / `--diff` rewriting         | **a real `theme` command** with `--audit` and `--diff` modes                                    |

That last row is the one that unblocks shipping `ds-theme`. Its stage table becomes real CLI
vocabulary rather than wrapper sugar.

`--layer` currently joins `base/layer` in `ds.mjs`. Port it verbatim; the layer-**map** semantics are
Phase 2b step 3 and stay out of scope here.

---

## Files

| Path                                        | Change                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ai-plugin/cli/.claude-plugin/plugin.json`      | new — `name: figma2react`, `version` synced from `package.json`                      |
| `ai-plugin/cli/skills/`                         | new — the four shipped skills + `design-system/references/{atomic,theme,cli}.md`     |
| `ai-plugin/cli/src/{env,offline}.ts`            | new — `.env` loading, fixture server                                                 |
| `ai-plugin/cli/src/index.ts`                    | global `--offline`/`--live`; optional targets; real `theme` command; `config.gen` defaults |
| `ai-plugin/cli/package.json`                    | `files: ["dist", "skills", ".claude-plugin"]`                                        |
| `ai-plugin/cli/test/e2e.test.ts`                | reuse `offline.ts`; cover offline-by-default and config-derived target               |
| `.claude-plugin/marketplace.json`           | new — one entry, `"source": "./ai-plugin/cli"`                                           |
| `.claude/settings.json`                     | new — `extraKnownMarketplaces` (directory source) + `enabledPlugins`                 |
| `.claude/skills/ds-verify/`                 | new — repo gates, Starter-tier fact, orphan note, `references/gates.md`              |
| `.claude/skills/{design-system,ds-*}/`      | **deleted** — moved into the plugin                                                  |
| `scripts/ds.mjs`                            | **deleted**                                                                          |
| `scripts/verify-skills.mjs`                 | new — the drift detector, below                                                      |
| `package.json`                              | `ds:*` call `figma2react` directly; `verify` gains `verify-skills`                   |
| `docs/design-system-plugin-plan.md`         | this plan, per the repo convention                                                   |

## Build order

1. Fold `ds.mjs` into the CLI, `ds.mjs` still present and delegating. `pnpm verify` green.
2. Repoint `ds:*` scripts at `figma2react`; delete `ds.mjs`. `pnpm verify` green.
3. Move the skills into `ai-plugin/cli/skills/`, rewrite their commands and `allowed-tools`
   (`Bash(figma2react *)`), split out `ds-verify`.
4. Add `plugin.json`, `marketplace.json`, `.claude/settings.json`. Confirm the skills load here.
5. Add `verify-skills.mjs` to the chain.
6. Prove the consumer path with a packed tarball.

Step 2 is the only irreversible one, and it is one `git revert` wide.

---

## The drift detector

The problem that started this has no detector today, so add the cheapest one that would actually
fire: parse every `figma2react <verb>` out of the shipped SKILL.md code fences and assert each is a
real command on the `commander` program. Prose drift is unassertable; **a skill naming a command
that does not exist is not.**

Same script asserts `plugin.json.version === package.json.version`, since NX will bump one and not
the other.

## Verification

1. **`pnpm verify` green at every step**, never red across more than one.
2. **The fold actually worked** — from a clean shell with no `FIGMA_TOKEN` exported and `.env`
   present, `npx figma2react audit` with no arguments runs offline, reads the config, exits 0. That
   single command is the whole point of step 1.
3. **The detector fires.** Rename a CLI verb, confirm `verify-skills.mjs` fails naming the skill and
   the verb; desync the two versions, confirm it fails. Per this repo's habit: break it deliberately
   before trusting it.
4. **The plugin loads here.** `/design-system`, `/ds-generate`, `/ds-design-review`, `/ds-theme`
   appear from the committed project settings, with no manual install.
5. **The consumer path works.** `pnpm pack` `ai-plugin/cli` into a scratch dir, install it, add a
   marketplace entry with the npm source, confirm the skills appear and `figma2react audit` runs
   against that repo's own `design-system.json`.
6. **Nothing repo-specific shipped.** Grep the plugin for `pnpm `, `figma-to-react-example`,
   `scripts/`, `Starter` — all should be absent, all should be present in `ds-verify`.

## The `tools/` → `ai-plugin/` rename

The directory was renamed after this plan was written. Every functional reference had to move with
it: `pnpm-workspace.yaml`, the root `build`/`typecheck` scripts, `vitest.config.ts`,
`verify-skills.mjs`, `verify-tokens.mjs`, `design-system.json`'s `offline.fixture`, and the
marketplace `source`.

**`vitest.config.ts` was the one a path grep missed**, because its glob is brace-expanded —
`{tools,packages}/*/test/**` contains no literal `tools/`. It failed open: no test files matched,
so `vitest` exited 1 with "No test files found" rather than reporting a broken path.

Nothing inside `ai-plugin/cli/skills/` needed touching, which is the point of the split — the
shipped skills name no repository path at all, so a directory rename cannot reach them.

## What actually landed, and where it differs from the plan

- **`ds-generate`'s orphan step ships after all**, contrary to the plan's "does not ship". The
  orphan behaviour belongs to the *tool* — `gen` never deletes — so warning a consumer about it is
  correct. What stayed behind is this repo's cleanup procedure (`examples/src/app.tsx`, `pnpm
  verify`), which is now in `ds-verify`.
- **The detector grew a third check.** Besides commands/flags and version sync, it fails on any of
  `pnpm `, `figma-to-react-example`, `scripts/`, or `Starter` appearing in the plugin — the four
  repo facts that must not ship. It is the only mechanical guard on the seam.
- **The marketplace path must be `"."`, not absolute.** `claude plugin marketplace add ./ --scope
  project` writes an absolute path, which cannot be committed. Rewrite it by hand after.
- **Config `gen` defaults are scoped to the configured target.** Not in the original plan; forced
  by three e2e failures. A config found by walking up must not apply its flags to a different Figma
  file — that would be an ambush, and it broke the `--stories` tests immediately.

## Out of scope

`--prune` (backlog, but named in `ds-verify` as a known gap) · Phase 2b's layer map · publishing to
a real registry · a marketplace repo for the plugin separate from this one · MCP servers or hooks in
the plugin · skills for the layer packages (`ds-atoms` et al.) · Phase 3's a11y/e2e/security skills.
