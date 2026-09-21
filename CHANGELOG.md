# Changelog

All notable changes to `n8n-nodes-planvortex` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

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
