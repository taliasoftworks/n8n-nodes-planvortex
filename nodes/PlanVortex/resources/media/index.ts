import type { INodeProperties } from 'n8n-workflow';
import { mediaUploadDescription } from './upload';

export const mediaOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: { resource: ['media'] },
		},
		options: [
			{
				name: 'Upload',
				value: 'upload',
				action: 'Upload a file',
				description: "Add an image or a video to the organization's library, to attach to a post",
			},
		],
		default: 'upload',
	},
];

export const mediaFields: INodeProperties[] = [...mediaUploadDescription];
