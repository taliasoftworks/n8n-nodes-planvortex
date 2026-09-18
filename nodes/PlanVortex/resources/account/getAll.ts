import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { planVortexApiRequestAllItems } from '../../transport';
import { getOrganizationId, type OperationHandler } from '../helpers';

const showOnlyForAccountGetMany = {
	resource: ['account'],
	operation: ['getAll'],
};

export const accountGetManyDescription: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForAccountGetMany },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: { ...showOnlyForAccountGetMany, returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnlyForAccountGetMany },
		options: [
			{
				displayName: 'Capability',
				name: 'capability',
				type: 'options',
				default: 'publications',
				options: [
					{ name: 'Comments', value: 'comments' },
					{ name: 'Messages', value: 'messages' },
					{ name: 'Persistent Menu', value: 'persistent_menu' },
					{ name: 'Products', value: 'products' },
					{ name: 'Publications', value: 'publications' },
					{ name: 'Webhooks', value: 'webhooks' },
				],
				description:
					'Only accounts whose network can do this. It is the matrix of GET /social_capabilities applied by the server, which is how a workflow asks for the accounts it can publish with without keeping its own table of what each network does.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: "Free-text search over the account's name and username",
			},
			{
				displayName: 'Social Network Names or IDs',
				name: 'social_network',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getSocialNetworks' },
				default: [],
				description: 'Only accounts of these networks. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
];

/**
 * The connected accounts of an organization, one item each.
 *
 * Worth reading on the way past: `error_code` is `0` on a healthy account and a PlanVortex error
 * code on one whose connection has stopped working. Reconnecting it is not something a workflow
 * can do — it is an OAuth flow with a person in it, which is what the Create Connect Link
 * operation is for.
 */
export const getAccounts: OperationHandler = async function (this, index) {
	const organizationId = getOrganizationId(this, index);
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	const qs: IDataObject = { ...filters };
	if (Array.isArray(qs.social_network) && qs.social_network.length === 0) {
		delete qs.social_network;
	}

	return await planVortexApiRequestAllItems.call(
		this,
		`/organizations/${organizationId}/accounts`,
		'accounts',
		qs,
		returnAll ? undefined : (this.getNodeParameter('limit', index, 50) as number),
	);
};
