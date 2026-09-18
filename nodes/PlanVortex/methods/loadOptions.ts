import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { planVortexApiRequest, planVortexApiRequestAllItems } from '../transport';
import { networkLabel } from '../resources/helpers';

/**
 * The dropdowns.
 *
 * They are the reason this node is worth building at all. Every route in the API hangs off an
 * `id_organization`, and there is no plain `GET /organizations`: the list lives inside
 * `/clients_organizations`, keyed by a client id that whoever builds the workflow has no way of
 * knowing. A node that asks for an ObjectId in a text box is a node nobody uses twice, so the
 * ids are looked up here and the person picks a name.
 */

/** Options are sorted by label so the list does not reorder itself between calls. */
function sorted(options: INodePropertyOptions[]): INodePropertyOptions[] {
	return options.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The organizations an app can reach, in one call.
 *
 * `/clients_organizations` answers with each client and its organizations nested inside, which is
 * exactly the shape this needs. The client's name is only prefixed when there is more than one:
 * an app normally sees a single client, and repeating its name on every row would just be noise.
 */
export async function getOrganizations(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const response = (await planVortexApiRequest.call(this, 'GET', '/clients_organizations', undefined, {
		limit: 100,
		limitOrganizations: 100,
	})) as { clients?: IDataObject[] };

	const clients = response?.clients ?? [];
	const options: INodePropertyOptions[] = [];

	for (const client of clients) {
		const organizations = (client.organizations as IDataObject[] | undefined) ?? [];
		for (const organization of organizations) {
			const name = String(organization.name ?? organization._id);
			options.push({
				name: clients.length > 1 ? `${String(client.name ?? '')} — ${name}` : name,
				value: String(organization._id),
			});
		}
	}

	return sorted(options);
}

/**
 * The accounts of the organization already picked above.
 *
 * The network goes in the label because two accounts of the same brand read identically otherwise,
 * and on the networks where a PlanVortex account is a channel — Discord, Telegram, Slack — a
 * workflow author is picking between several rows of the same name.
 */
export async function getAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await loadAccounts(this);
}

/**
 * The same list, minus the networks that do not publish.
 *
 * Two of the thirteen are connectable and never accept a post: WhatsApp has no feed and Google
 * Business is a listing that receives reviews. `capability` applies the matrix of
 * `GET /social_capabilities` server-side, so this node keeps no table of its own about which
 * network does what — the thing that goes stale the day a network is added.
 */
export async function getPublishingAccounts(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await loadAccounts(this, { capability: 'publications' });
}

async function loadAccounts(
	context: ILoadOptionsFunctions,
	qs: IDataObject = {},
): Promise<INodePropertyOptions[]> {
	const organizationId = String(context.getCurrentNodeParameter('organizationId') ?? '').trim();
	// No organization picked yet. An empty list is the honest answer; calling the API without one
	// would be a 404 rendered as a broken dropdown.
	if (organizationId === '') return [];

	const accounts = await planVortexApiRequestAllItems.call(
		context,
		`/organizations/${organizationId}/accounts`,
		'accounts',
		qs,
	);

	return sorted(
		accounts.map((account) => ({
			name: `${String(account.name ?? account._id)} (${networkLabel(String(account.social_network ?? ''))})`,
			value: String(account._id),
		})),
	);
}

/** Every network PlanVortex supports, for the filters and for a connection link. */
export async function getSocialNetworks(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const networks = (await planVortexApiRequest.call(this, 'GET', '/social_networks')) as string[];
	return sorted(
		(networks ?? []).map((network) => ({ name: networkLabel(network), value: network })),
	);
}

/**
 * The networks that have comments at all.
 *
 * It is the capability matrix again, and it is the filter that stops a workflow asking Slack for
 * an inbox it does not have. TikTok and WhatsApp answer `false` here for reasons of their own.
 */
export async function getCommentNetworks(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const capabilities = (await planVortexApiRequest.call(this, 'GET', '/social_capabilities')) as Record<
		string,
		IDataObject
	>;

	return sorted(
		Object.entries(capabilities ?? {})
			.filter(([, matrix]) => matrix?.comments === true)
			.map(([network]) => ({ name: networkLabel(network), value: network })),
	);
}
