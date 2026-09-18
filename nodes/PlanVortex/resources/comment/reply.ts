import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { planVortexApiRequest } from '../../transport';
import { getOrganizationId, getRequiredId, type OperationHandler } from '../helpers';

const showOnlyForCommentReply = {
	resource: ['comment'],
	operation: ['reply'],
};

export const commentReplyDescription: INodeProperties[] = [
	{
		displayName: 'Comment ID',
		name: 'commentId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: showOnlyForCommentReply },
		description:
			"PlanVortex's own ID for the comment, the _id field of the Get Many operation — not the ID the social network gave it",
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		displayOptions: { show: showOnlyForCommentReply },
		description:
			"The public reply. It cannot be empty and it has to fit the network's own comment limit, which is not the same as its limit for a post.",
	},
];

/**
 * Reply to a comment, publicly, on the network it came from.
 *
 * Needs a paid plan, like the inbox. And it is worth remembering what this is: it publishes under
 * the brand's name, in public, from a workflow. Everything a comment contains was written by a
 * stranger, so a flow that pipes one straight into a model and the model's answer straight into
 * here is a flow that lets the public write the brand's replies.
 *
 * What comes back carries three things: the comment being answered, the reply as it was stored,
 * and `credits_consumed` — X charges for this, every other network does not.
 */
export const replyToComment: OperationHandler = async function (this, index) {
	const organizationId = getOrganizationId(this, index);
	const commentId = getRequiredId(
		this,
		index,
		'commentId',
		'comment',
		'A reply hangs off the comment it answers.',
	);
	const text = this.getNodeParameter('text', index, '') as string;

	const response = (await planVortexApiRequest.call(
		this,
		'POST',
		`/organizations/${organizationId}/comments/${commentId}/reply`,
		{ text },
	)) as IDataObject;

	return [response ?? {}];
};
