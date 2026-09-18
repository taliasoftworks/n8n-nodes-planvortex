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

> **Status: in development.** The operations below are built, but the package is not published to
> npm yet. Until it is, PlanVortex works in n8n through the `HTTP Request` node against the REST
> API, or through the `MCP Client` node pointed at `npx -y planvortex-mcp`.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in
the n8n community nodes documentation.

On n8n Cloud, only the instance **owner or an admin** can install a community node, from the nodes
panel.

## Operations

| Resource | Operation | What it does |
| --- | --- | --- |
| Publication | Create | Publishes now or schedules a post on one connected account |
| Media | Upload | Puts an image or a video in the organization's library, ready to attach |
| Account | Get Many | Lists the connected accounts, with a filter for what their network can do |
| Account | Create Connect Link | Mints a single-use link for a person to connect one of their own accounts |
| Comment | Get Many | Reads the comment and review inbox |
| Comment | Reply | Publishes a public reply to a comment or a review |
| Social Network | Get Capabilities | Says what every network supports, one item per network |

The organization and the account are **dropdowns**, filled from your own account: nothing here
asks you to paste an id. Both still accept an expression when the id comes from an earlier node.

Seven operations, not one hundred and thirty-five. Anything else the API does is one `HTTP Request`
node away, using the same credential — see the [PlanVortex API
documentation](https://planvortex.com/en/developers).

Four things are worth knowing before you build on them:

- **Connecting a social account cannot be automated.** It is an OAuth flow with a person clicking
  "authorize" on the network's own screen, and app credentials are refused outright. *Create
  Connect Link* gives you a link that lasts fifteen minutes and connects one account; send your
  user to it and watch the accounts listing for the result.
- **An invalid post is not an error.** PlanVortex stores it in state `withErrors`, with the reasons
  inside it, and answers 200 — so a workflow that only watches for exceptions would report a post
  that never went out as sent. *Create* has a **Fail on Publication Errors** toggle, on by default,
  that turns it into a real failure.
- **Not every network does everything.** Google Business receives reviews and never publishes,
  WhatsApp has no feed, Slack publishes and has no comment inbox at all. *Get Capabilities* is how
  a workflow finds that out once instead of one network at a time, in production. The account
  dropdown for publishing already hides the accounts that cannot publish.
- **Comments and replies need a paid plan.** The rest of this node works on the free one.

## Credentials

You need a PlanVortex account and an **app** (API credentials), which you create in the PlanVortex
panel. An app gives you a `client_id` and a `client_secret`; the node exchanges them for an access
token using the OAuth 2.0 client-credentials grant, and n8n caches that token for you.

Create a **PlanVortex OAuth2 API** credential in n8n and fill in three fields:

| Field | What goes in it |
| --- | --- |
| Base URL | `https://api.planvortex.com/v1.0.0` — leave it alone unless you were given another environment |
| Client ID | the app's `client_id` |
| Client Secret | the app's `client_secret` |

There is no "Connect" button and there should not be one: the client-credentials grant has no
consent screen. Use **Test** instead — it performs the real token exchange and reads back the
clients and organizations the app can see.

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
