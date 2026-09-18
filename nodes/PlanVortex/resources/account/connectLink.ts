import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { planVortexApiRequest } from '../../transport';
import { getOrganizationId, type OperationHandler } from '../helpers';

const showOnlyForAccountConnectLink = {
	resource: ['account'],
	operation: ['connectLink'],
};

export const accountConnectLinkDescription: INodeProperties[] = [
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: showOnlyForAccountConnectLink },
		options: [
			{
				displayName: 'Redirect URI',
				name: 'redirect_uri',
				type: 'string',
				default: '',
				description:
					'Where your user lands once they have finished connecting. It has to be one of the redirect URLs registered on your PlanVortex app, or the call answers error 532.',
			},
			{
				displayName: 'Social Network Name or ID',
				name: 'social_network',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSocialNetworks' },
				default: '',
				description:
					'Bind the link to one network, so it can connect that one and nothing else. Leave it out to let the person choose. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
		],
	},
];

/**
 * Mint a link that lets a person connect one of their own social accounts.
 *
 * This is the operation that makes a workflow multi-tenant, and the only one whose endpoint is not
 * the obvious one. Connecting an account is an OAuth flow with a human clicking "authorize" on the
 * network's own screen, so `GET /connect_links` — the route that looks like the right one — refuses
 * app credentials outright with error 519. What an app is allowed to do is issue a *temporal
 * connect token*: a fifteen-minute, single-connection credential, tied to this organization, that
 * belongs in somebody's browser and nowhere else.
 *
 * So the node hands back a `url`, and it is for a person to open. Nothing appears until they
 * finish; the account shows up in the accounts listing afterwards.
 */
export const createConnectLink: OperationHandler = async function (this, index) {
	const organizationId = getOrganizationId(this, index);
	const options = this.getNodeParameter('options', index, {}) as IDataObject;

	const response = (await planVortexApiRequest.call(
		this,
		'GET',
		`/organizations/${organizationId}/temporal_connect_token`,
		undefined,
		{ ...options },
	)) as IDataObject;

	return [response ?? {}];
};
