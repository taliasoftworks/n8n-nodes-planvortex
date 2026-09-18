# n8n-nodes-planvortex

An n8n community node for [PlanVortex](https://planvortex.com/en). It lets an n8n workflow publish
to social networks, upload media, read and reply to comments, and hand a client a link to connect
their own accounts.

PlanVortex manages thirteen social networks from one API — Facebook, Instagram, Threads, LinkedIn,
TikTok, X, WhatsApp, YouTube, Google Business, Bluesky, Discord, Telegram and Slack. The ones worth
naming here are the last three: announcing a release on LinkedIn, dropping it in a customer Discord
and posting it to an internal Slack channel is normally three separate integrations.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/)
workflow automation platform.

> **Status: in development.** The package is not published yet and the operations below are still
> being built. Until then, PlanVortex works in n8n through the `HTTP Request` node against the REST
> API, or through the `MCP Client` node pointed at `npx -y planvortex-mcp`.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in
the n8n community nodes documentation.

On n8n Cloud, only the instance **owner or an admin** can install a community node, from the nodes
panel.

## Operations

Not implemented yet. Anything this node does not cover is reachable with the `HTTP Request` node
against the [PlanVortex API](https://planvortex.com/en/developers).

## Credentials

You need a PlanVortex account and an **app** (API credentials), which you create in the PlanVortex
panel. An app gives you a `client_id` and a `client_secret`; the node exchanges them for an access
token using the OAuth 2.0 client-credentials grant, and n8n caches that token for you.

Apps are available on all PlanVortex plans, including the free one.

Note that **comments and comment replies require a paid plan**. A workflow built on a free plan
will publish happily and fail on the comment steps.

## Compatibility

Requires Node.js 20 or newer. Tested against current n8n versions.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [PlanVortex API documentation](https://planvortex.com/en/developers)

## License

[MIT](LICENSE.md)
