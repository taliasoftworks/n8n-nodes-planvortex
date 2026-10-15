import type { IDataObject, IExecuteFunctions, INodeProperties, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
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
				displayName: 'Allow Comments',
				name: 'allowComments',
				type: 'boolean',
				default: false,
				description:
					"Whether the audience can comment. TikTok only: TikTok's content sharing guidelines ask that a person decides it, so add it and leave it off unless they said yes. Left out, TikTok's default applies (allowed). If the creator turned comments off in the TikTok app, they stay off.",
			},
			{
				displayName: 'Allow Duet',
				name: 'allowDuet',
				type: 'boolean',
				default: false,
				description:
					'Whether the audience can make a Duet with the video. TikTok videos only; ignored on photo posts and on every other network.',
			},
			{
				displayName: 'Allow Stitch',
				name: 'allowStitch',
				type: 'boolean',
				default: false,
				description:
					'Whether the audience can make a Stitch with the video. TikTok videos only; ignored on photo posts and on every other network.',
			},
			{
				displayName: 'Branded Content',
				name: 'brandedContent',
				type: 'boolean',
				default: false,
				description:
					'Whether the post is a paid partnership promoting a third party. TikTok only: it is labeled "Paid partnership", and it cannot be private (Visibility must be Public or Friends, or the publication is stored with error 2504).',
			},
			{
				displayName: 'Destination Name or ID',
				name: 'destinationId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getDestinations',
					loadOptionsDependsOn: ['organizationId', 'accountId'],
				},
				default: '',
				description: 'Where the post goes inside the account, on the networks where the account alone does not say. Required on Pinterest, where it is the board; every other network ignores it. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Destination Section ID',
				name: 'destinationSectionId',
				type: 'string',
				default: '',
				description:
					'Optional, and Pinterest only: the section of the board picked in Destination. GET /organizations/{ID}/accounts/{ID}/destinations/{board} lists the sections of a board.',
			},
			{
				displayName: 'Internal Name',
				name: 'name',
				type: 'string',
				default: '',
				description:
					'A label for your own use. It is never shown on the social network; it is there to group publications.',
			},
			{
				displayName: 'Link',
				name: 'link',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/product',
				description:
					"Where the post leads when someone opens it. Only Pinterest has this field, as the pin's destination link, and every other network ignores it: there, a link goes inside the text.",
			},
			{
				displayName: 'Made for Kids',
				name: 'made_for_kids',
				type: 'boolean',
				default: false,
				description:
					'Whether the video is made for kids (COPPA). YouTube only, and the law makes it the channel owner\'s call: a video directed at children has to be uploaded with this on. Every other network ignores it.',
			},
			{
				displayName: 'Promotes Own Brand',
				name: 'yourBrand',
				type: 'boolean',
				default: false,
				description:
					'Whether the post promotes the creator or their own business. TikTok only: it is labeled "Promotional content". Every other network ignores it.',
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
			{
				displayName: 'Visibility',
				name: 'visibility',
				type: 'options',
				default: 'public',
				options: [
					{ name: 'Followers (TikTok, Private Accounts)', value: 'followers' },
					{ name: 'Friends (TikTok)', value: 'friends' },
					{ name: 'Only Me', value: 'private' },
					{ name: 'Public', value: 'public' },
					{ name: 'Unlisted (YouTube)', value: 'unlisted' },
				],
				description:
					"Who can see the post. YouTube and TikTok only; every other network ignores it. On TikTok it should be a person's choice (its content sharing guidelines forbid a default), and which values an account allows depends on the account: a private one has Followers instead of Public. A value the account does not allow when the post goes out stores it with error 2505 and the values it does allow.",
			},
		],
	},
];

/**
 * The board, in the shape the API takes: an object, `{ id, section_id? }`, never a bare id.
 *
 * Nothing is sent when no board was picked. On Pinterest the API then stores the publication
 * with error 987, which is the right answer and the one the person can act on; on every other
 * network there is nothing to send. A section without its board is refused here, before the
 * request: the API would read it as a destination with an empty id and answer the same 987,
 * which names the board when what is wrong is the order the fields were filled in.
 */
function buildDestination(
	context: IExecuteFunctions,
	index: number,
	destinationId: string,
	sectionId: string,
): IDataObject | undefined {
	const board = destinationId.trim();
	const section = sectionId.trim();

	if (board === '') {
		if (section !== '') {
			throw new NodeOperationError(context.getNode(), 'A section was given without its board', {
				itemIndex: index,
				description:
					'A section belongs to a board. Pick the board in Destination as well, or leave Destination Section ID empty.',
			});
		}
		return undefined;
	}

	return section === '' ? { id: board } : { id: board, section_id: section };
}

/**
 * TikTok's interactions, in the shape the API takes: `{ comments, duet, stitch }`.
 *
 * Only the ones the workflow added travel: a key that is missing is the network's default, which
 * is not the same as `false`. Nothing at all is sent when none was added, which is what every
 * network but TikTok wants (there the API deletes the field anyway).
 */
function buildInteractions(comments: unknown, duet: unknown, stitch: unknown): IDataObject | undefined {
	const chosen: IDataObject = {};
	if (typeof comments === 'boolean') chosen.comments = comments;
	if (typeof duet === 'boolean') chosen.duet = duet;
	if (typeof stitch === 'boolean') chosen.stitch = stitch;
	return Object.keys(chosen).length > 0 ? chosen : undefined;
}

/**
 * The commercial content disclosure, `{ your_brand, branded_content }`, sent only when one of the
 * two was added. Both travel together: the API reads the pair, and an object with only one of them
 * would leave the other to a default the person never saw.
 */
function buildCommercialContent(yourBrand: unknown, brandedContent: unknown): IDataObject | undefined {
	if (typeof yourBrand !== 'boolean' && typeof brandedContent !== 'boolean') return undefined;
	return { your_brand: yourBrand === true, branded_content: brandedContent === true };
}

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

	const {
		destinationId = '',
		destinationSectionId = '',
		link = '',
		allowComments,
		allowDuet,
		allowStitch,
		yourBrand,
		brandedContent,
		...fields
	} = additionalFields;
	const interactions = buildInteractions(allowComments, allowDuet, allowStitch);
	const commercialContent = buildCommercialContent(yourBrand, brandedContent);
	const destination = buildDestination(
		this,
		index,
		String(destinationId),
		String(destinationSectionId),
	);
	const trimmedLink = String(link).trim();

	const account = await getAccountOnce(this, index, organizationId, accountId, run);
	const files = splitIds(fileIds);

	const body: IDataObject = {
		social_network: account.social_network,
		...(text === '' ? {} : { text }),
		...(files.length > 0 ? { files } : {}),
		...fields,
		...(destination ? { destination } : {}),
		...(trimmedLink === '' ? {} : { link: trimmedLink }),
		...(interactions ? { interactions } : {}),
		...(commercialContent ? { commercial_content: commercialContent } : {}),
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
