import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PlanVortexOAuth2Api implements ICredentialType {
	name = 'planVortexOAuth2Api';

	extends = ['oAuth2Api'];

	// The icon lives next to the credential on purpose. n8n copies every .svg preserving its
	// path, and resolving it as '../nodes/PlanVortex/planvortex.svg' would make the credential
	// depend on where the node folder sits. It is brand art and it does not move.
	icon = { light: 'file:planvortex.svg', dark: 'file:planvortex.dark.svg' } as const;

	displayName = 'PlanVortex OAuth2 API';

	// Link to your community node's README
	documentationUrl = 'https://github.com/taliasoftworks/n8n-nodes-planvortex?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://api.example.com/oauth/token',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'users:read users:write companies:read',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
