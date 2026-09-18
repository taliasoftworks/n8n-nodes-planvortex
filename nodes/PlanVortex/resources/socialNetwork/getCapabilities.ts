import type { IDataObject } from 'n8n-workflow';
import { planVortexApiRequest } from '../../transport';
import type { OperationHandler } from '../helpers';

/**
 * What each network can actually do, one item per network.
 *
 * This is not a catalogue page, it is the thing that stops a workflow failing at three in the
 * morning for a reason that looks like ours. Not every connected account does everything: Slack
 * publishes and has no comment inbox at all, Google Business receives reviews and never publishes,
 * WhatsApp is a messaging channel with no feed. A flow that branches on this asks the question
 * once; a flow that does not finds out one network at a time, in production.
 *
 * The API answers a map keyed by network. It is turned inside out here, into one item per network
 * with the name on it, because that is what a filter or an IF node in n8n can work with — and
 * because a single item holding thirteen objects is not a list of anything.
 *
 * Note the word capability: `comments: true` means the network has comments, not that it allows
 * every action on one. Which actions are allowed is a finer matrix, at
 * GET /social_comment_actions, and it is reachable with the HTTP Request node.
 */
export const getSocialCapabilities: OperationHandler = async function (this) {
	const capabilities = (await planVortexApiRequest.call(
		this,
		'GET',
		'/social_capabilities',
	)) as Record<string, IDataObject>;

	return Object.entries(capabilities ?? {}).map(([social_network, matrix]) => ({
		social_network,
		...matrix,
	}));
};
