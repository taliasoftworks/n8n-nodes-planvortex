import type { ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * PlanVortex authenticates with the OAuth 2.0 client-credentials grant, and n8n's generic
 * `oAuth2Api` already implements the whole of it: it exchanges the app's `client_id` and
 * `client_secret` for an access token, stores the token next to the credential, and asks for a
 * new one when the API answers 401. Nothing in this package obtains, caches or renews a token by
 * hand, and nothing should start.
 *
 * The class name is not a style choice. `@n8n/community-nodes/cred-class-oauth2-naming` requires
 * anything extending `oAuth2Api` to end in `OAuth2Api` and to carry `OAuth2` in both `name` and
 * `displayName`. And `name` is what the credentials a user has already saved point at, so it does
 * not change after release either.
 */
export class PlanVortexOAuth2Api implements ICredentialType {
	name = 'planVortexOAuth2Api';

	extends = ['oAuth2Api'];

	// The icon lives next to the credential on purpose. n8n copies every .svg preserving its
	// path, and resolving it as '../nodes/PlanVortex/planvortex.svg' would make the credential
	// depend on where the node folder sits. It is brand art and it does not move.
	icon = { light: 'file:planvortex.svg', dark: 'file:planvortex.dark.svg' } as const;

	displayName = 'PlanVortex OAuth2 API';

	documentationUrl =
		'https://github.com/taliasoftworks/n8n-nodes-planvortex?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.planvortex.com/v1.0.0',
			required: true,
			placeholder: 'https://api.planvortex.com/v1.0.0',
			description:
				'Root of the PlanVortex API, version segment included. Leave the default unless you were given another environment.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'clientCredentials',
		},
		{
			// Derived from the base URL rather than typed twice: an access token URL pointing at
			// one environment while the requests go to another fails as "invalid credentials",
			// which is the least informative way this can possibly break. The trailing-slash
			// dance is the idiom n8n's own Mautic credential uses.
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default:
				'={{$self["baseUrl"].endsWith("/") ? $self["baseUrl"].slice(0, -1) : $self["baseUrl"]}}/oauth/token',
		},
		{
			// Empty on purpose, and it has to stay empty. PlanVortex has no application scopes:
			// `POST /oauth/token` forwards whatever arrives here straight to the identity
			// provider, which rejects an unknown scope with a 400 that the facade deliberately
			// flattens into "Invalid client credentials" — so an invented scope reports perfectly
			// good credentials as wrong. n8n drops the parameter entirely when it is empty.
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			// `body` is `client_secret_post`, `header` is `client_secret_basic`. PlanVortex accepts
			// both, so this is pinned rather than offered: one fewer thing to get wrong.
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];

	/**
	 * Without this, a perfectly good credential shows up red.
	 *
	 * n8n's fallback test for anything extending `oAuth2Api` just checks whether the credential
	 * already holds an `oauthTokenData.access_token`. That works for the authorization-code grant,
	 * where the user clicks "Connect" and a token lands immediately. Client credentials has no
	 * such button: the token is only fetched the first time a node actually runs, so a freshly
	 * saved credential has nothing stored and the fallback reports failure.
	 *
	 * A `test` declared here takes precedence over that fallback (see n8n's
	 * `CredentialsTester.getCredentialTestFunction`, which checks `type.test` first) and is run
	 * through the full OAuth2 path, so it proves the real thing: the token exchange works and the
	 * app can read. `/clients_organizations` is the cheapest endpoint that needs authentication
	 * and it answers for an app token with the app's own client and its organizations.
	 */
	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{$credentials.baseUrl.endsWith("/") ? $credentials.baseUrl.slice(0, -1) : $credentials.baseUrl}}',
			url: '/clients_organizations',
			method: 'GET',
		},
	};
}
