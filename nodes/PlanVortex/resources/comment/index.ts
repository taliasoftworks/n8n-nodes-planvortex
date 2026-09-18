import type { INodeProperties } from 'n8n-workflow';
import { commentGetManyDescription } from './getAll';
import { commentReplyDescription } from './reply';

export const commentOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['comment'] },
		},
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many comments',
				description: 'Get many comments',
			},
			{
				name: 'Reply',
				value: 'reply',
				action: 'Reply to a comment',
				description: 'Publish a public reply to a comment or a review',
			},
		],
		default: 'getAll',
	},
];

export const commentFields: INodeProperties[] = [
	...commentGetManyDescription,
	...commentReplyDescription,
];
