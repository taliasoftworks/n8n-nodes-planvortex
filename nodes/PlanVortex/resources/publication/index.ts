import type { INodeProperties } from 'n8n-workflow';
import { publicationCreateDescription } from './create';

export const publicationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['publication'] },
		},
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a publication',
				description: 'Publish now or schedule a post on one connected account',
			},
		],
		default: 'create',
	},
];

export const publicationFields: INodeProperties[] = [...publicationCreateDescription];
