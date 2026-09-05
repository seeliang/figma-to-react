# Contract: Published package

**Feature**: `001-nx-pnpm-workspace` · **Consumers**: anyone installing `@seeliang/*`

What a tarball from this repository promises. This is the contract that fails **at a consumer's
machine**, long after CI was green, which is why every clause below is checked mechanically.

## Registry and authentication

Packages are published to **GitHub Packages** (`https://npm.pkg.github.com`) under the `@seeliang`
scope.

> ⚠️ **Authentication is required to install, even though these packages are public.** This is a
> property of the registry, not a choice made here. Verified 2026-09-05:
> `GET https://npm.pkg.github.com/@seeliang%2Fgithub-package-sample` →
> `401 {"error":"authentication token not provided"}`.

A consumer needs, before installing:

```
# .npmrc
@seeliang:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

and `NODE_AUTH_TOKEN` set to a **classic** personal access token with `read:packages`. Fine-grained
tokens do not work. FR-046 requires the README to say this before the first release, because a
consumer hitting an unexplained 401 has no way to guess it.

## Contents

| Clause | Requirement |
| ------ | ----------- |
| **No workspace references** | No file in the archive may contain the substring `workspace:`. An internal dependency appears as a concrete version range (FR-026). Mechanically enforced by `scripts/verify-no-workspace-refs.mjs`, not delegated to the packaging tool (FR-027). |
| **Declared files only** | The archive contains exactly what `files` names, plus `package.json` and `README.md`. |
| **Resolvable dependencies** | Every dependency resolves for an authenticated consumer, transitively (FR-043). |
| **Provenance** | An attestation binds the archive to the commit and workflow run that produced it (FR-037), verifiable with `gh attestation verify <tarball> --repo seeliang/figma-to-react`. |

## The three packages at 0.1.0

| Package | Contains | A consumer can |
| ------- | -------- | -------------- |
| `@seeliang/f2r-core` | a built `dist/`, no dependencies | import it |
| `@seeliang/f2r-cli` | a built `dist/`; depends on `f2r-core@0.1.0` and `github-package-sample` | import it; both dependencies resolve transitively (FR-043) |
| `@seeliang/f2r-theme` | `package.json` and `README.md` only | install it; **not** import it — it has no entry point at `0.1.0` (FR-039b, FR-044) |

`f2r-cli` is the interesting one: installing it exercises the workspace rewrite, external transitive
resolution and consumer authentication in a single act. If any of the three is broken, that one
install fails.

## Versioning

- Independent per package. `f2r-cli` bumps when `f2r-core` bumps (FR-028); `f2r-theme` moves on its
  own.
- **A version number is spent once.** The registry permits deleting a version but never reusing its
  number. Re-publishing fails, and that is the contract working (FR-045).
- A release publishing several packages is **not atomic**. On partial failure the pipeline reports
  exactly which succeeded, and the rest are published at the same version with
  `--projects=<remaining>` (FR-038). No registry offers a transaction across separate publishes; the
  guarantee here is precise reporting and a resumable path, not atomicity.

## What is not promised at 0.1.0

Stated plainly so nobody builds on it: these packages have **no useful behaviour**. `0.1.0` exists to
prove the release path while the payload is empty. The API surface will change without ceremony
until a release says otherwise.
