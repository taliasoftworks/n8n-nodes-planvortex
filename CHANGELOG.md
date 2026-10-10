# Changelog

All notable changes to `n8n-nodes-planvortex` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-10-10

### Added

- **Pinterest pins.** *Publication → Create* has three new optional fields under Additional
  Fields: **Destination**, a dropdown of the account's boards read from the API (a secret board
  says so in its label); **Destination Section ID**, for a section of that board; and **Link**,
  the URL the pin leads to. Pinterest requires the board, so until now a pin created from n8n was
  stored with error 987 and never went out. Every other network ignores the three fields.
- **Advice for the three errors those fields can bring**: 987 (a pin without a board), 992 (a
  Destination on a network that has none) and 994 (a Link that is not an http(s) URL).

### Changed

- **The README reflects the verification.** Installing from the nodes panel of n8n Cloud comes
  first, the "verification pending" notice is gone, and Pinterest is in the list of networks.

## [0.1.2] - 2026-10-07

### Changed

- **The error catalogue is refreshed from the server**, and it brings a new family, `comments`
  (2600-2699). Its only code today is 2600: a LinkedIn personal profile, which LinkedIn now lets
  PlanVortex connect next to the pages, publishes but has no comment inbox. The failure says so
  instead of falling back to the generic advice. The refresh also widens the ranges the node
  already knew (auth up to 554, social accounts up to 716, publications up to 996) and adds the
  messages of the codes that arrived with them.

## [0.1.1] - 2026-10-01

### Fixed

- **The node now appears under Marketing & Content in the nodes panel.** Its codex file declared
  the category `Marketing`, which n8n does not recognise and drops without a word, so the node was
  listed under Communication only. Raised by n8n's Creator Portal review.

## [0.1.0] - 2026-09-19

The first release: one node, one credential and seven operations — the ones a workflow actually
asks for. Anything else the PlanVortex API does is one `HTTP Request` node away, with the same
credential.

### Added

- **The PlanVortex OAuth2 API credential**, over the client-credentials grant: Base URL, Client ID
  and Client Secret, and nothing else. n8n obtains and caches the token. Its **Test** performs the
  real token exchange, because a client-credentials credential has no token to show until a node
  first runs, and n8n's default OAuth2 test reports a perfectly good one as failed.
- **Publication → Create**: publish now or schedule a post on one connected account, attaching
  the files a **Media → Upload** step returned. **Fail on Publication Errors**, on by default,
  turns a post that PlanVortex stored as `withErrors` — with a 200 — into a real failure.
- **Media → Upload**: the binary data of the incoming item, as a multipart upload.
- **Account → Get Many**, with a filter for what each network can do, and **Account → Create
  Connect Link**: a single-use link, valid for fifteen minutes, for a person to connect one of
  their own accounts. App credentials can never connect an account themselves; this is the way
  they hand the job to the person who can.
- **Comment → Get Many** and **Comment → Reply**, over the comment and review inbox. Both need a
  paid PlanVortex plan.
- **Social Network → Get Capabilities**: what every network supports, one item per network, so a
  workflow finds out once that Slack has no comment inbox and Google Business never publishes.
- **Dropdowns for the organization and the account**, filled from the credential's own access.
  Neither asks for an id, and both still take an expression.
- **Errors explained per code.** PlanVortex answers a numbered code, and a code is a diagnosis
  where its range is not: 516 (the free plan), 519 (a call app credentials can never make) and 520
  (a missing permission, named) sit side by side and mean different things. The catalogue is
  generated from the server's, never retyped. **Continue On Fail** costs one item, not the run.
