import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { userDescription } from './resources/user';
import { companyDescription } from './resources/company';

export class PlanVortex implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlanVortex',
		name: 'planVortex',
		icon: { light: 'file:planvortex.svg', dark: 'file:planvortex.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the PlanVortex API',
		defaults: {
			name: 'PlanVortex',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'planVortexOAuth2Api', required: true }],
		requestDefaults: {
			// The base URL comes from the credential, never from a constant here: the credential is
			// where the access token URL is derived from too, and the two pointing at different
			// environments is the failure that reads as "invalid credentials".
			baseURL:
				'={{$credentials.baseUrl.endsWith("/") ? $credentials.baseUrl.slice(0, -1) : $credentials.baseUrl}}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'Company',
						value: 'company',
					},
				],
				default: 'user',
			},
			...userDescription,
			...companyDescription,
		],
	};
}
