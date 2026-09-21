# CLAUDE.md — n8n-nodes-planvortex

The n8n community node for PlanVortex. Its roadmap lives in the server repo,
`PlanVortexServer/.claude/roadmaps/n8n.md`, and that document is what decides what gets built and
in which order.

**The goal of this package is not to be published on npm — it is to pass n8n's Creator Portal
verification.** A community node that is not verified cannot be installed on n8n Cloud at all: it
only works on self-hosted instances with `N8N_COMMUNITY_PACKAGES_ENABLED` turned on, which is the
audience that already knew how to wire an `HTTP Request` node. Every rule below exists because
verification requires it.

## Three rules that contradict the other PlanVortex repos

Read these before anything else. All three look like mistakes if you arrive from
`PlanVortexServer`, `PlanVortexNode` or `PlanVortexPython`, and "fixing" any of them fails the
verification.

### 1. English only — including error messages

n8n requires it literally: *"Both the node interface and all documentation must be in English
only... including parameter names, descriptions, help text, error messages and README content."*

The other repos write comments and many identifiers in Spanish. **This one does not.** Error
messages are where Spanish creeps back in without anyone noticing, because they are written in a
hurry and nobody reads them until they fire. They are reviewed.

### 2. Zero runtime dependencies

`dependencies` in `package.json` must stay **empty**. n8n requires it: *"Ensure that your package
does not include any external dependencies."*

The consequence is the one that surprises people: **this node does not use our own `planvortex`
npm library**, which was exactly the instinct. It goes to the network with
`this.helpers.httpRequest` and nothing else — no `axios` either. Everything the library solves
(token handling, error translation, pagination) is solved again here, in a few lines, importing
nothing.

Dev dependencies *are* allowed, which is the escape hatch for the error catalogue: it is
**generated at build time** from the same source that feeds the libraries, never retyped by hand.
See *The error catalogue* below.

`test/dependencies.test.ts` fails the build the day someone adds "just one small utility".

### 3. No Claude attribution anywhere

This repo is public, like `PlanVortexNode` — whose history already had to be rewritten for this.
No attribution lines in commit messages, and **watch the PR footer too**.

## The error catalogue

PlanVortex classifies by a numbered `code` in the body, never by the HTTP status: an expired token,
a disconnected account and a text that is too long are all 400s. The catalogue lives in the server
repository and this package may not import it, so it is **read, committed and generated** — in two
steps, because CI clones only this repository:

```bash
npm run errors:sync       # upstream -> errors/planvortex-errors.json   (needs the sibling repos)
npm run errors:generate   # that JSON -> nodes/PlanVortex/transport/errors.generated.ts
```

`errors:generate` also runs automatically before every build, so the generated file is never stale
against the snapshot. Both outputs are committed.

**The point is not saving typing — it is that the hand-written half stops compiling when the
catalogue moves.** `nodes/PlanVortex/transport/errors.ts` is typed against the generated one, so:

- a per-code note for a code the server retired (924 and 1401 went that way) is a build error;
- a family added upstream leaves the per-family table incomplete, which is a build error;
- a catalogue message that is not in English needs an English replacement, and the compiler asks
  for it — that is how rule 1 above survives a message written in Spanish upstream.

**The advice is per code first and per family second, and that order is the whole design.** The
catalogue groups by range and a range is not a diagnosis: 516 (free plan), 519 (a call an app may
never make) and 520 (a missing permission) all live in the range the docs call "auth", and the MCP
server shipped advice that told users with perfect credentials to go and check their credentials.

One more thing the generator does deliberately: **a family runs from its own first code up to the
next family's, not up to the `to` its range documents.** The published ceilings lag behind the
server — 547, 548 and 716 already sit above theirs — and reading them literally answers "unknown
family", whose generic advice is "do not just retry" while 716 means exactly the opposite.
`errors:sync` prints the codes that have passed a documented ceiling; that list is a nudge to
update the OpenAPI sentence in PlanVortexHome, not something this package can fix.

## Layout

- `nodes/PlanVortex/` — the node, its icon and its resource descriptions.
- `nodes/PlanVortex/resources/<resource>/<operation>.ts` — one operation per file, holding both its
  parameters and the function that runs it. The node's `execute` is only a router, and it is the
  one place that attaches `pairedItem`, so an operation cannot forget to.
- `nodes/PlanVortex/methods/loadOptions.ts` — the dropdowns. Every route in the API hangs off an
  `id_organization` that whoever builds the workflow has no way of knowing, so it is looked up
  here and the person picks a name.
- `nodes/PlanVortex/transport/` — **the only place that goes to the network.** Base URL,
  credential, paging convention, array-in-query convention and the shape of an error are decided
  once, there. Nothing else calls `this.helpers.httpRequest` — the same rule `slack/Http.ts` and
  `discord/Http.ts` keep in the server repo.

**The node is programmatic, not declarative, and that is not a preference.** Declarative routing
goes to the network by itself, which would leave half the operations translating PlanVortex's
numbered errors and half not — and the half that did not would be the half nobody notices until a
workflow fails at three in the morning. Two operations could not be declarative anyway: the media
upload reads binary data off the item and builds a multipart body, and creating a publication has
to resolve the account's network first because the API requires it in the body.
- `credentials/` — the credential type. It extends n8n's generic `oAuth2Api` with
  `grantType: clientCredentials`; n8n obtains and caches the token itself, and PlanVortex's
  `POST /oauth/token` already accepts both `client_secret_post` and `client_secret_basic`.
- `test/` — vitest, no network and no credentials. One file per seam: the requests the
  transport builds, the translation of an error, the seven operations, the dropdowns, the
  node's own routing, the credential, and the two that guard what n8n's verification checks
  (`dependencies.test.ts`, `verification.test.ts`). `test/helpers/context.ts` is the n8n they
  all run inside: it records every request exactly as it was built and never normalises it,
  because a fake that tidied the options up would be testing itself.
- `errors/planvortex-errors.json` — the committed snapshot of the server's error catalogue.
- `scripts/sync-errors.mjs`, `scripts/generate-errors.mjs` — the two steps above.
- `scripts/scan-local.mjs` — runs n8n's official static analysis against this working copy.
- `scripts/scan-published.mjs` — the same scanner against a version on npm, with an exit code.
- `scripts/check-credentials.mjs` — the only script that touches a real deployment. Read-only.

## Commands

```bash
npm run build     # n8n-node build
npm run lint      # n8n-node lint (the same rules the verification scan applies)
npm test          # vitest, no network
npm run typecheck # tsc over the sources AND the tests — vitest does not type-check them
npm run scan      # builds, then n8n's scanner over the source AND the files the tarball carries
npm run scan:published -- 0.1.0   # n8n's full scan of a version on npm, provenance included
npm run dev       # n8n-node dev: a local n8n with this node loaded

npm run errors:generate   # errors/planvortex-errors.json -> errors.generated.ts (runs before build)
npm run errors:sync       # refresh that JSON from PlanVortexServer and the published OpenAPI

# Read-only, against a real deployment. Needs PLANVORTEX_CLIENT_ID and PLANVORTEX_CLIENT_SECRET.
npm run credentials:check
```

**`npm test` on its own is not a gate.** Vitest runs the tests through esbuild, which strips
the types without checking them, and the build's `tsconfig.json` only includes what gets
published — so nothing was checking the tests at all. `npm run typecheck` uses
`tsconfig.test.json` for that, and it earned its place the moment it was written by catching a
cast that was wrong.

CI runs lint, typecheck, test and build on Node 22 and 24 (not 20: see `ci.yml`), plus two jobs
of their own: the n8n scan, and a regeneration of the error catalogue diffed against what is
committed — the generated file says "do not edit" and that sentence is not a mechanism.

`npm run lint` prints nothing when it passes. To convince yourself it is still running, put a
`color` inside the node's `defaults` and watch it go red — a `color` at the top level of the
description does **not** trip it, which is a convincing-looking way to be fooled.

The lint reads the **source**, not the running value, and the difference shows up in one place:
any parameter whose options are loaded from the API has to end its `description` with n8n's exact
sentence — *"Choose from the list, or specify an ID using an expression"*, with the link — written
as a **plain string literal**. A template literal that produces exactly that string is still
reported, so the sentence is spelled out in every dynamic parameter instead of shared from a
constant.

`npx @n8n/scan-community-package n8n-nodes-planvortex` is the published-package form of `npm run
scan`, and the one n8n runs on a submission: provenance first, then the source at the commit the
provenance names (downloaded from GitHub), then the tarball. **Do not wire that CLI into anything:
it prints a ❌ and exits 0**, and even its progress line says "✅ Analyzed" over a failure.
`npm run scan:published` calls the same function and exits 1. (On Windows, run it from
PowerShell: under Git Bash the scanner picks up GNU `tar`, which cannot extract to a `C:\` path,
and it reports that as a source it could not fetch.)

## Releasing

Publishing is `.github/workflows/publish.yml`, and **only** that: n8n does not verify a package
published from a laptop, and `prepublishOnly` refuses a hand-made `npm publish` for that reason.
A release is cut by hand, as in the other PlanVortex packages:

1. Bump `version` in `package.json` and write its entry in `CHANGELOG.md`.
2. Commit, then tag **that** commit `vX.Y.Z` and push both: `git push origin main vX.Y.Z`.

The workflow refuses a tag that does not match `package.json`, runs every gate, publishes with
provenance, and then scans what it published the way n8n will. It is idempotent: a version
already on npm is not published again, so re-pushing a tag is a green no-op.

`npm run release` is the scaffold's release-it, and it is kept because n8n's tooling expects it.
It tags `vX.Y.Z` too (`release-it.git.tagName` in `package.json` — the workflow ignores any other
tag, silently), but it **regenerates `CHANGELOG.md` from commit messages** with auto-changelog,
overwriting what was written by hand. Prefer the two steps above.

**Authentication is npm's Trusted Publisher (OIDC)**, configured on npmjs.com against owner
`taliasoftworks`, repository `n8n-nodes-planvortex` and workflow `publish.yml` — compared
character by character, and npm does not say which one is wrong: the symptom is an `E404` on the
upload that means "not allowed", not "not found". There is no npm token in the repository. The
one exception was the very first publish: npm only lets a Trusted Publisher be configured on a
package that already exists, so 0.1.0 is published by this same workflow with a temporary
`NPM_TOKEN` secret, revoked and deleted straight after. The workflow still honours that secret if it is ever set, and says so in
the log; it should not be.

@AGENTS.md
