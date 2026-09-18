import type { IDataObject, INodeProperties, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { planVortexApiRequest } from '../../transport';
import { describeApiError } from '../../transport/errors';
import {
	getAccountOnce,
	getOrganizationId,
	getRequiredId,
	splitIds,
	type OperationHandler,
} from '../helpers';

const showOnlyForPublicationCreate = {
	resource: ['publication'],
	operation: ['create'],
};

export const publicationCreateDescription: INodeProperties[] = [
	{
		displayName: 'Account Name or ID',
		name: 'accountId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getPublishingAccounts',
			loadOptionsDependsOn: ['organizationId'],
		},
		default: '',
		required: true,
		displayOptions: { show: showOnlyForPublicationCreate },
		description: 'The connected account to publish on: one publication goes to one account. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: { show: showOnlyForPublicationCreate },
		description:
			'The body of the post. Every network measures it differently and the ceilings are far apart, so check GET /social_limits before writing long. Either this or at least one file is required.',
	},
	{
		displayName: 'File IDs',
		name: 'fileIds',
		type: 'string',
		default: '',
		placeholder: '507f1f77bcf86cd799439011,507f191e810c19729de860ea',
		displayOptions: { show: showOnlyForPublicationCreate },
		description:
			'Images and videos to attach, as a comma-separated list of upload IDs. They come from the Upload Media operation, which answers with the upload it created.',
	},
	{
		displayName: 'Fail on Publication Errors',
		name: 'failOnPublicationErrors',
		type: 'boolean',
		default: true,
		displayOptions: { show: showOnlyForPublicationCreate },
		description:
			'Whether to treat a publication stored with errors as a failure of this node. The API does not reject invalid content: it stores the publication in state withErrors with the reasons inside it and answers 200, so a workflow that only checks for an exception reports a post that never went out as sent.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: showOnlyForPublicationCreate },
		options: [
			{
				displayName: 'Internal Name',
				name: 'name',
				type: 'string',
				default: '',
				description:
					'A label for your own use. It is never shown on the social network; it is there to group publications.',
			},
			{
				displayName: 'Publication Type',
				name: 'publication_type',
				type: 'options',
				default: 'profile',
				options: [
					{ name: 'Group', value: 'group' },
					{ name: 'Profile', value: 'profile' },
					{ name: 'Reels', value: 'reels' },
					{ name: 'Stories', value: 'stories' },
				],
				description:
					'Where the post goes on networks that have more than one surface. Not every network accepts every type, and an unsupported pairing comes back as error 923.',
			},
			{
				displayName: 'Publish Date',
				name: 'publish_date',
				type: 'dateTime',
				default: '',
				description:
					'When the post must go out. Leave it empty to publish immediately, in this same request; a date in the future schedules it and a background job sends it at that time.',
			},
			{
				displayName: 'State',
				name: 'state',
				type: 'options',
				default: 'ready',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Ready', value: 'ready' },
				],
				description:
					'Draft stores the post for a person to review and sends nothing. Leave this out to let the API decide, which is what you want in almost every workflow.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description:
					'Only some networks have a title field: it is optional on LinkedIn and required on YouTube, where it is the video title and cannot exceed 100 characters',
			},
		],
	},
];

/**
 * Create a publication.
 *
 * Two things here are not obvious from the endpoint.
 *
 * The first is `social_network`, which the API requires in the body even though the account is
 * already in the path — without it the call fails with error 702. Rather than ask the workflow
 * author to keep a network next to an account they picked from a list, the node reads it off the
 * account. The account is fetched once per execution and remembered (see `RunState`).
 *
 * The second is that invalid content is not an error. A post that is too long, or that carries a
 * kind of file its network will not take, is stored in state `withErrors` with the reasons in
 * `publication_errors` — and answered with a 200. In a workflow that silence is the worst possible
 * outcome: a scheduled run reports success and nothing was published. `failOnPublicationErrors`
 * turns it into a real failure, and it defaults to on.
 */
export const createPublication: OperationHandler = async function (this, index, run) {
	const organizationId = getOrganizationId(this, index);
	const accountId = getRequiredId(
		this,
		index,
		'accountId',
		'account',
		'A publication goes to one connected account.',
	);
	const text = this.getNodeParameter('text', index, '') as string;
	const fileIds = this.getNodeParameter('fileIds', index, '') as string;
	const failOnPublicationErrors = this.getNodeParameter(
		'failOnPublicationErrors',
		index,
		true,
	) as boolean;
	const additionalFields = this.getNodeParameter('additionalFields', index, {}) as IDataObject;

	const account = await getAccountOnce(this, index, organizationId, accountId, run);
	const files = splitIds(fileIds);

	const body: IDataObject = {
		social_network: account.social_network,
		...(text === '' ? {} : { text }),
		...(files.length > 0 ? { files } : {}),
		...additionalFields,
	};

	const response = (await planVortexApiRequest.call(
		this,
		'POST',
		`/organizations/${organizationId}/accounts/${accountId}/publish`,
		body,
	)) as { publication?: IDataObject };

	const publication = response?.publication ?? {};
	const errors = (publication.publication_errors as IDataObject[] | undefined) ?? [];

	if (failOnPublicationErrors && errors.length > 0) {
		// The same translation the transport gives an HTTP failure, because these are the same
		// numbered codes — and this is where a workflow meets them most often. A post that is too
		// long or aimed at a network that does not publish never fails the request: it is stored
		// with the reason inside it and answered with a 200.
		const first = errors[0] ?? {};
		const described = describeApiError({
			code: Number(first.code ?? 0),
			message: typeof first.message === 'string' ? first.message : undefined,
			data: first.data as IDataObject | undefined,
		});
		throw new NodeApiError(this.getNode(), publication as unknown as JsonObject, {
			message: described.message,
			description: `${described.description} The publication exists in state ${String(publication.state ?? '')} and was not sent. Its full record, including every reason, is in the error details.`,
			itemIndex: index,
		});
	}

	return [publication];
};
