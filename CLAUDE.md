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

`test/dependencies.test.ts` fails the build the day someone adds "just one small utility".

### 3. No Claude attribution anywhere

This repo is public, like `PlanVortexNode` — whose history already had to be rewritten for this.
No attribution lines in commit messages, and **watch the PR footer too**.

## Layout

- `nodes/PlanVortex/` — the node, its icon and its resource descriptions.
- `credentials/` — the credential type. It extends n8n's generic `oAuth2Api` with
  `grantType: clientCredentials`; n8n obtains and caches the token itself, and PlanVortex's
  `POST /oauth/token` already accepts both `client_secret_post` and `client_secret_basic`.
- `test/` — vitest, no network.
- `scripts/scan-local.mjs` — runs n8n's official static analysis against this working copy.

## Commands

```bash
npm run build     # n8n-node build
npm run lint      # n8n-node lint (the same rules the verification scan applies)
npm test          # vitest, no network
npm run scan      # n8n's community-package scanner, against this working copy
npm run dev       # n8n-node dev: a local n8n with this node loaded
```

`npx @n8n/scan-community-package n8n-nodes-planvortex` is the published-package form of `npm run
scan`: it downloads the tarball from npm and also checks provenance, so it cannot run until the
package is published.

@AGENTS.md
