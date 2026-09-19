import { describe, expect, it } from 'vitest';
import {
	getAccounts,
	getCommentNetworks,
	getOrganizations,
	getPublishingAccounts,
	getSocialNetworks,
} from '../nodes/PlanVortex/methods/loadOptions';
import { BASE_URL, createLoadOptionsContext } from './helpers/context';

/**
 * The dropdowns, which are the reason this node is worth building at all.
 *
 * Every route in the API hangs off an `id_organization`, and there is no plain
 * `GET /organizations`: the list lives inside `/clients_organizations`, keyed by a client id
 * whoever builds the workflow has no way of knowing. A node that asks for an ObjectId in a text
 * box is a node nobody uses twice.
 */

const ORGANIZATION = '507f1f77bcf86cd799439011';

describe('the organization dropdown', () => {
	it('flattens the clients into their organizations', async () => {
		const { context, requests } = createLoadOptionsContext({
			respond: [
				{
					clients: [
						{
							name: 'Talia Softworks',
							organizations: [
								{ _id: 'o2', name: 'Marketing' },
								{ _id: 'o1', name: 'Brand' },
							],
						},
					],
				},
			],
		});

		const options = await getOrganizations.call(context);

		expect(requests[0].url).toBe(`${BASE_URL}/clients_organizations`);
		expect(requests[0].qs).toEqual({ limit: 100, limitOrganizations: 100 });
		// Sorted by label, so the list does not reorder itself between calls.
		expect(options).toEqual([
			{ name: 'Brand', value: 'o1' },
			{ name: 'Marketing', value: 'o2' },
		]);
	});

	it('names the client only when the credential reaches more than one', async () => {
		const { context } = createLoadOptionsContext({
			respond: [
				{
					clients: [
						{ name: 'One', organizations: [{ _id: 'o1', name: 'Brand' }] },
						{ name: 'Two', organizations: [{ _id: 'o2', name: 'Brand' }] },
					],
				},
			],
		});

		const options = await getOrganizations.call(context);

		expect(options.map((option) => option.name)).toEqual(['One — Brand', 'Two — Brand']);
	});

	it('survives a client with no organizations on it', async () => {
		const { context } = createLoadOptionsContext({ respond: [{ clients: [{ name: 'Empty' }] }] });

		expect(await getOrganizations.call(context)).toEqual([]);
	});
});

describe('the account dropdowns', () => {
	/**
	 * Nothing is picked yet when the node is first opened. Calling the API without an
	 * organization would be a 404 rendered as a dropdown that looks broken.
	 */
	it('answers an empty list, and asks nothing, before an organization is chosen', async () => {
		const { context, requests } = createLoadOptionsContext({ currentParameters: {} });

		expect(await getAccounts.call(context)).toEqual([]);
		expect(requests).toHaveLength(0);
	});

	it('says which network each account is on, because several read alike', async () => {
		const { context } = createLoadOptionsContext({
			currentParameters: { organizationId: ORGANIZATION },
			respond: [
				{
					accounts: [
						{ _id: 'a1', name: 'Anuncios', social_network: 'discord' },
						{ _id: 'a2', name: 'Anuncios', social_network: 'google_business' },
					],
					total: 2,
				},
			],
		});

		const options = await getAccounts.call(context);

		// On Discord, Telegram and Slack a PlanVortex account is a channel, so a workflow author
		// is picking between several rows of the same name.
		expect(options).toEqual([
			{ name: 'Anuncios (Discord)', value: 'a1' },
			{ name: 'Anuncios (Google Business)', value: 'a2' },
		]);
	});

	/**
	 * Two of the thirteen networks never accept a post. The matrix is applied by the server so
	 * this package keeps no table of its own — the thing that goes stale the day a network is
	 * added.
	 */
	it('asks the server for the accounts that can publish, rather than filtering here', async () => {
		const { context, requests } = createLoadOptionsContext({
			currentParameters: { organizationId: ORGANIZATION },
			respond: [{ accounts: [], total: 0 }],
		});

		await getPublishingAccounts.call(context);

		expect(requests[0].url).toBe(`${BASE_URL}/organizations/${ORGANIZATION}/accounts`);
		expect(requests[0].qs).toMatchObject({ capability: 'publications' });
	});
});

describe('the network dropdowns', () => {
	it('turns the catalogue into labels a person reads', async () => {
		const { context, requests } = createLoadOptionsContext({
			respond: [['telegram', 'google_business']],
		});

		const options = await getSocialNetworks.call(context);

		expect(requests[0].url).toBe(`${BASE_URL}/social_networks`);
		expect(options).toEqual([
			{ name: 'Google Business', value: 'google_business' },
			{ name: 'Telegram', value: 'telegram' },
		]);
	});

	it('offers only the networks that have comments at all', async () => {
		const { context } = createLoadOptionsContext({
			respond: [
				{
					slack: { comments: false },
					telegram: { comments: true },
					whatsapp: { comments: false },
				},
			],
		});

		// The filter that stops a workflow asking Slack for an inbox it does not have.
		expect(await getCommentNetworks.call(context)).toEqual([
			{ name: 'Telegram', value: 'telegram' },
		]);
	});
});
