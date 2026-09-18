import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { planVortexApiRequestAllItems } from '../../transport';
import { getOrganizationId, type OperationHandler } from '../helpers';

const showOnlyForCommentGetMany = {
	resource: ['comment'],
	operation: ['getAll'],
};

export const commentGetManyDescription: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: showOnlyForCommentGetMany },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: {
			show: { ...showOnlyForCommentGetMany, returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: showOnlyForCommentGetMany },
		options: [
			{
				displayName: 'Account Name or ID',
				name: 'id_account',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getAccounts',
					loadOptionsDependsOn: ['organizationId'],
				},
				default: '',
				description: 'Only comments on this connected account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Publication ID',
				name: 'id_publication',
				type: 'string',
				default: '',
				description:
					'Only comments on this publication of yours. A review never matches it: a review hangs off the business listing and has no publication behind it.',
			},
			{
				displayName: 'Rating',
				name: 'rating',
				type: 'multiOptions',
				default: [],
				options: [
					{ name: '1 Star', value: 1 },
					{ name: '2 Stars', value: 2 },
					{ name: '3 Stars', value: 3 },
					{ name: '4 Stars', value: 4 },
					{ name: '5 Stars', value: 5 },
				],
				description:
					'Only reviews with these star ratings. This is the filter that makes a review inbox useful — show me the one and two star ones first — and because only review networks carry a rating, it leaves every ordinary comment out.',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive substring match on the comment text',
			},
			{
				displayName: 'Social Network Names or IDs',
				name: 'social_network',
				type: 'multiOptions',
				typeOptions: { loadOptionsMethod: 'getCommentNetworks' },
				default: [],
				description: 'Only comments from these networks. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Unread Only',
				name: 'unread',
				type: 'boolean',
				default: true,
				description: 'Whether to return only the comments nobody has marked as read yet',
			},
		],
	},
];

/**
 * The comment inbox of an organization, one item per comment.
 *
 * Two things to know before building a workflow on it.
 *
 * It needs a **paid plan**: on the free one the API answers error 516, and it does so at whatever
 * hour the workflow happens to run rather than when it was built.
 *
 * And it is a snapshot, not a live read. The inbox is PlanVortex's own database, filled by a
 * collector that visits the networks on a schedule, so it costs nothing, never fails because one
 * account is disconnected, and is as fresh as the last collection. On Telegram it is also all
 * there is, and it starts the day the channel was connected: a bot cannot read a channel's past.
 */
export const getComments: OperationHandler = async function (this, index) {
	const organizationId = getOrganizationId(this, index);
	const returnAll = this.getNodeParameter('returnAll', index, false) as boolean;
	const filters = this.getNodeParameter('filters', index, {}) as IDataObject;

	const qs: IDataObject = { ...filters };
	for (const key of ['social_network', 'rating']) {
		if (Array.isArray(qs[key]) && (qs[key] as unknown[]).length === 0) {
			delete qs[key];
		}
	}
	// The API reads this one as a flag: anything but the literal `false` switches it on, so an
	// unread filter left off has to be left out of the query string rather than sent as false.
	if (qs.unread === false) {
		delete qs.unread;
	}

	return await planVortexApiRequestAllItems.call(
		this,
		`/organizations/${organizationId}/comments`,
		'comments',
		qs,
		returnAll ? undefined : (this.getNodeParameter('limit', index, 50) as number),
	);
};
