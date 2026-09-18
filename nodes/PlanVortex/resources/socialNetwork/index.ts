import type { INodeProperties } from 'n8n-workflow';

export const socialNetworkOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['socialNetwork'] },
		},
		options: [
			{
				name: 'Get Capabilities',
				value: 'getCapabilities',
				action: 'Get social network capabilities',
				description: 'Get what every network supports: publishing, messaging, comments and more',
			},
		],
		default: 'getCapabilities',
	},
];

/** The catalogue takes no parameters: it is the same answer for every caller. */
export const socialNetworkFields: INodeProperties[] = [];
