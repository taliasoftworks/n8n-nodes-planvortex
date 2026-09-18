import type { INodeProperties } from 'n8n-workflow';
import { accountConnectLinkDescription } from './connectLink';
import { accountGetManyDescription } from './getAll';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['account'] },
		},
		options: [
			{
				name: 'Create Connect Link',
				value: 'connectLink',
				action: 'Create a connect link',
				description: 'Get a single-use link for a person to connect one of their social accounts',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many accounts',
				description: 'Get many accounts',
			},
		],
		default: 'getAll',
	},
];

export const accountFields: INodeProperties[] = [
	...accountGetManyDescription,
	...accountConnectLinkDescription,
];
