import type { INodeProperties } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { PlanVortexOAuth2Api } from '../credentials/PlanVortexOAuth2Api.credentials';

/**
 * The credential, which is almost entirely made of things that fail quietly.
 *
 * Nothing here obtains, caches or renews a token: n8n's generic `oAuth2Api` does all of it. What
 * this class does is declare five hidden fields, and three of the five break in ways that look
 * like something else — a scope that reports good credentials as wrong, a missing test that
 * paints a working credential red, a class name that fails the verification lint.
 */

const credential = new PlanVortexOAuth2Api();

function property(name: string): INodeProperties {
	const found = credential.properties.find((one) => one.name === name);
	if (found === undefined) throw new Error(`The credential has no "${name}" property`);
	return found;
}

describe('PlanVortexOAuth2Api', () => {
	/**
	 * `@n8n/community-nodes/cred-class-oauth2-naming` requires anything extending `oAuth2Api` to
	 * end in `OAuth2Api` and to carry `OAuth2` in both names. And `name` is what the credentials
	 * a user has already saved point at, so it cannot change after release either.
	 */
	it('is named the way a credential extending oAuth2Api has to be named', () => {
		expect(credential.name).toBe('planVortexOAuth2Api');
		expect(credential.name.endsWith('OAuth2Api')).toBe(true);
		expect(credential.displayName).toContain('OAuth2');
		expect(credential.extends).toEqual(['oAuth2Api']);
	});

	it('uses the client-credentials grant, which is what an app has', () => {
		expect(property('grantType').default).toBe('clientCredentials');
		expect(property('grantType').type).toBe('hidden');
		// `body` is client_secret_post. PlanVortex accepts both, so it is pinned rather than
		// offered: one fewer thing to get wrong.
		expect(property('authentication').default).toBe('body');
	});

	/**
	 * The one that reports a perfectly good credential as wrong. PlanVortex has no application
	 * scopes: `POST /oauth/token` forwards whatever arrives here to the identity provider, which
	 * rejects an unknown scope with a 400 that the facade flattens into "Invalid client
	 * credentials". The scaffold ships a filler scope, and n8n drops the parameter entirely when
	 * it is empty — so empty is the only correct value.
	 */
	it('sends no scope at all', () => {
		expect(property('scope').default).toBe('');
		expect(property('scope').type).toBe('hidden');
	});

	/**
	 * Derived from the base URL rather than typed twice: an access token URL pointing at one
	 * environment while the requests go to another fails as "invalid credentials", which is the
	 * least informative way this can break.
	 */
	it('derives the token endpoint from the base URL, trailing slash and all', () => {
		const accessTokenUrl = String(property('accessTokenUrl').default);

		expect(accessTokenUrl.startsWith('=')).toBe(true);
		expect(accessTokenUrl).toContain('$self["baseUrl"]');
		expect(accessTokenUrl).toContain('endsWith("/")');
		expect(accessTokenUrl.endsWith('/oauth/token')).toBe(true);
	});

	it('defaults the base URL to production, version segment included', () => {
		expect(property('baseUrl').default).toBe('https://api.planvortex.com/v1.0.0');
		expect(property('baseUrl').required).toBe(true);
	});

	/**
	 * Without this, a correct credential shows up red. n8n's fallback test for anything extending
	 * `oAuth2Api` checks whether an `access_token` is already stored, which client credentials
	 * never has before the first run: the token is fetched when a node executes, not when the
	 * credential is saved. A `test` declared here takes precedence over that fallback.
	 */
	it('declares its own test, which the client-credentials grant cannot do without', () => {
		expect(credential.test).toBeDefined();
		expect(credential.test.request.method).toBe('GET');
		// The cheapest authenticated endpoint, and the one that answers for an app token.
		expect(credential.test.request.url).toBe('/clients_organizations');
		expect(String(credential.test.request.baseURL)).toContain('$credentials.baseUrl');
	});

	/** n8n copies every `.svg` preserving its path, so the credential carries its own copy. */
	it('carries its icon next to itself, in both themes', () => {
		expect(credential.icon).toEqual({
			light: 'file:planvortex.svg',
			dark: 'file:planvortex.dark.svg',
		});
	});
});
