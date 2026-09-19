import type { IDataObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { createConnectLink } from '../nodes/PlanVortex/resources/account/connectLink';
import { getAccounts } from '../nodes/PlanVortex/resources/account/getAll';
import { getComments } from '../nodes/PlanVortex/resources/comment/getAll';
import { replyToComment } from '../nodes/PlanVortex/resources/comment/reply';
import { newRunState } from '../nodes/PlanVortex/resources/helpers';
import { uploadMedia } from '../nodes/PlanVortex/resources/media/upload';
import { createPublication } from '../nodes/PlanVortex/resources/publication/create';
import { getSocialCapabilities } from '../nodes/PlanVortex/resources/socialNetwork/getCapabilities';
import { BASE_URL, createExecuteContext } from './helpers/context';

/**
 * The seven operations, tested on the request they build rather than on the answer they parse.
 *
 * That is where the mistakes live. A publication without its network is a 702; a filter sent in
 * the wrong shape is an unfiltered inbox answered with a 200; the connect link asked of the
 * obvious endpoint is a 519. None of those are visible in the node's output until a workflow is
 * running against a real account.
 */

const ORGANIZATION = '507f1f77bcf86cd799439011';
const ACCOUNT = '507f191e810c19729de860ea';

describe('publication: create', () => {
	const account = { _id: ACCOUNT, social_network: 'linkedin', name: 'Talia Softworks' };

	it("puts the account's network in the body, which the API requires and the workflow never typed", async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, accountId: ACCOUNT, text: 'Hello' },
			respond: [{ account }, { publication: { _id: 'p1', state: 'sended' } }],
		});

		const items = await createPublication.call(context, 0, newRunState());

		expect(requests[0].url).toBe(`${BASE_URL}/organizations/${ORGANIZATION}/accounts/${ACCOUNT}`);
		expect(requests[1].method).toBe('POST');
		expect(requests[1].url).toBe(
			`${BASE_URL}/organizations/${ORGANIZATION}/accounts/${ACCOUNT}/publish`,
		);
		// Without it the API answers 702, and asking the workflow author to keep a network next to
		// an account they picked from a list is how a post ends up on the wrong network.
		expect(requests[1].body).toMatchObject({ social_network: 'linkedin', text: 'Hello' });
		expect(items).toEqual([{ _id: 'p1', state: 'sended' }]);
	});

	/**
	 * A workflow publishing fifty items to the same account would otherwise ask the API fifty
	 * times what network it is on. The state is created per execution, never at module scope.
	 */
	it('asks for the account once per execution, however many items are published', async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, accountId: ACCOUNT, text: 'Hello' },
			respond: [
				{ account },
				{ publication: { _id: 'p1' } },
				{ publication: { _id: 'p2' } },
			],
		});

		const run = newRunState();
		await createPublication.call(context, 0, run);
		await createPublication.call(context, 1, run);

		expect(requests.filter((request) => request.method === 'GET')).toHaveLength(1);
		expect(requests.filter((request) => request.method === 'POST')).toHaveLength(2);
	});

	it('sends the files as a list and drops what an expression left empty', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				accountId: ACCOUNT,
				text: '',
				fileIds: ' 1a , ,2b,',
			},
			respond: [{ account }, { publication: {} }],
		});

		await createPublication.call(context, 0, newRunState());

		const body = requests[1].body as IDataObject;
		expect(body.files).toEqual(['1a', '2b']);
		// An empty text is left out rather than sent: the API takes text or files, not an empty
		// string, and an id of '' comes back as a 503 about the organization.
		expect(body).not.toHaveProperty('text');
	});

	it('passes the optional fields through as the API names them', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				accountId: ACCOUNT,
				text: 'Hello',
				additionalFields: {
					title: 'A title',
					publish_date: '2026-10-01T09:00:00.000Z',
					state: 'draft',
				},
			},
			respond: [{ account }, { publication: {} }],
		});

		await createPublication.call(context, 0, newRunState());

		expect(requests[1].body).toMatchObject({
			title: 'A title',
			publish_date: '2026-10-01T09:00:00.000Z',
			state: 'draft',
		});
	});

	/**
	 * The silence this operation exists to break. Invalid content is not rejected: the
	 * publication is stored in state `withErrors` with the reasons inside it and the API answers
	 * 200, so a workflow that only watches for exceptions reports a post that never went out as
	 * sent — at three in the morning, on a schedule.
	 */
	it('fails when the API stored the publication with errors instead of sending it', async () => {
		const { context } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, accountId: ACCOUNT, text: 'Hello' },
			respond: [
				{ account },
				{
					publication: {
						_id: 'p1',
						state: 'withErrors',
						publication_errors: [{ code: 942, message: 'This network does not publish' }],
					},
				},
			],
		});

		const error = (await createPublication
			.call(context, 0, newRunState())
			.catch((thrown: Error) => thrown)) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('This network does not publish');
		// The same translation an HTTP failure gets, because these are the same numbered codes —
		// and this is where a workflow meets them most often.
		expect(error.description).toContain('(PlanVortex error 942)');
		expect(error.description).toContain('withErrors');
	});

	it('hands the publication back untouched when the workflow asked to be told nothing', async () => {
		const publication = {
			_id: 'p1',
			state: 'withErrors',
			publication_errors: [{ code: 942, message: 'This network does not publish' }],
		};
		const { context } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				accountId: ACCOUNT,
				text: 'Hello',
				failOnPublicationErrors: false,
			},
			respond: [{ account }, { publication }],
		});

		expect(await createPublication.call(context, 0, newRunState())).toEqual([publication]);
	});

	it('says which field is empty before spending a request on it', async () => {
		const { context, requests } = createExecuteContext({ parameters: {} });

		const error = (await createPublication
			.call(context, 0, newRunState())
			.catch((thrown: Error) => thrown)) as NodeOperationError;

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toContain('organization');
		// An empty id would reach the API as an invalid ObjectId and come back as a 503 about the
		// organization, which points at whichever field was not the problem.
		expect(requests).toHaveLength(0);
	});
});

describe('media: upload', () => {
	it('sends the file as multipart, with the name and type it arrived with', async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION },
			binary: { data: { fileName: 'photo.png', mimeType: 'image/png' }, buffer: Buffer.from('bytes') },
			respond: [{ upload: { _id: 'u1' } }],
		});

		const items = await uploadMedia.call(context, 0, newRunState());

		expect(requests[0].url).toBe(`${BASE_URL}/organizations/${ORGANIZATION}/uploads`);
		expect(requests[0].method).toBe('POST');
		// `json: false` is the only way a FormData body survives the helper.
		expect(requests[0].json).toBe(false);

		const form = requests[0].body as FormData;
		expect(form).toBeInstanceOf(FormData);
		const file = form.get('file') as File;
		expect(file.name).toBe('photo.png');
		expect(file.type).toBe('image/png');
		expect(await file.text()).toBe('bytes');

		expect(items).toEqual([{ _id: 'u1' }]);
	});

	it('lets the workflow rename a file that arrived without an extension', async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, options: { fileName: 'poster.jpg' } },
			binary: { data: { fileName: 'download', mimeType: 'image/jpeg' }, buffer: Buffer.from('x') },
			respond: [{ upload: {} }],
		});

		await uploadMedia.call(context, 0, newRunState());

		// PlanVortex decides what kind of file it is from the content type, and derives that from
		// the name when the source declared none.
		expect((requests[0].body as FormData).get('file')).toHaveProperty('name', 'poster.jpg');
	});
});

describe('comment: get many', () => {
	it('leaves an untouched filter out of the query string rather than sending it empty', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				limit: 10,
				filters: { social_network: [], rating: [], search: 'refund' },
			},
			respond: [{ comments: [{ _id: 'c1' }], total: 1 }],
		});

		await getComments.call(context, 0, newRunState());

		expect(requests[0].qs).toEqual({ search: 'refund', offset: 0, limit: 10 });
	});

	/**
	 * The API reads this one as a flag: anything but the literal `false` switches it on, so an
	 * unread filter turned off has to be left out and not sent as `false`.
	 */
	it('does not send the unread filter when it is switched off', async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, limit: 50, filters: { unread: false } },
			respond: [{ comments: [], total: 0 }],
		});

		await getComments.call(context, 0, newRunState());

		expect(requests[0].qs).not.toHaveProperty('unread');
	});

	it('keeps the networks as a repeated parameter, which is the only shape the inbox parses', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				returnAll: true,
				filters: { social_network: ['discord', 'telegram'], rating: [1, 2] },
			},
			respond: [{ comments: [{ _id: 'c1' }], total: 1 }],
		});

		await getComments.call(context, 0, newRunState());

		expect(requests[0].arrayFormat).toBe('repeat');
		expect(requests[0].qs).toMatchObject({
			social_network: ['discord', 'telegram'],
			rating: [1, 2],
		});
	});
});

describe('comment: reply', () => {
	it("posts the reply under PlanVortex's own id for the comment", async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, commentId: 'c1', text: 'Thanks!' },
			respond: [{ comment: {}, reply: { _id: 'r1' }, credits_consumed: 0 }],
		});

		const items = await replyToComment.call(context, 0, newRunState());

		expect(requests[0].method).toBe('POST');
		expect(requests[0].url).toBe(`${BASE_URL}/organizations/${ORGANIZATION}/comments/c1/reply`);
		expect(requests[0].body).toEqual({ text: 'Thanks!' });
		expect(items[0]).toHaveProperty('credits_consumed');
	});

	it('refuses to reply to nothing', async () => {
		const { context, requests } = createExecuteContext({
			parameters: { organizationId: ORGANIZATION, commentId: '   ', text: 'Thanks!' },
		});

		await expect(replyToComment.call(context, 0, newRunState())).rejects.toBeInstanceOf(
			NodeOperationError,
		);
		expect(requests).toHaveLength(0);
	});
});

describe('account: create connect link', () => {
	/**
	 * The one endpoint that is not the obvious one, and the operation that makes a workflow
	 * multi-tenant. `GET /connect_links` — the route that looks right — refuses app credentials
	 * outright with error 519, because connecting an account is an OAuth flow with a person
	 * clicking Authorize. What an app may issue is a temporal connect token.
	 */
	it('asks for a temporal connect token, not for a connect link', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				options: { social_network: 'bluesky', redirect_uri: 'https://example.test/done' },
			},
			respond: [{ url: 'https://app.planvortex.com/connect/abc', expires_in: 900 }],
		});

		const items = await createConnectLink.call(context, 0, newRunState());

		expect(requests[0].url).toBe(
			`${BASE_URL}/organizations/${ORGANIZATION}/temporal_connect_token`,
		);
		expect(requests[0].url).not.toContain('/connect_links');
		expect(requests[0].qs).toEqual({
			social_network: 'bluesky',
			redirect_uri: 'https://example.test/done',
		});
		expect(items[0]).toHaveProperty('url');
	});
});

describe('account: get many', () => {
	it('filters server-side by what a network can do, keeping no table of its own', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				organizationId: ORGANIZATION,
				limit: 5,
				filters: { capability: 'publications', social_network: [] },
			},
			respond: [{ accounts: [{ _id: ACCOUNT }], total: 1 }],
		});

		const items = await getAccounts.call(context, 0, newRunState());

		expect(requests[0].qs).toEqual({ capability: 'publications', offset: 0, limit: 5 });
		expect(items).toEqual([{ _id: ACCOUNT }]);
	});
});

describe('social network: get capabilities', () => {
	/**
	 * A single item holding thirteen objects is not a list of anything: an IF or a Filter node
	 * cannot branch on it. The map is turned inside out, with the network's name on each item.
	 */
	it('answers one item per network, with the network on it', async () => {
		const { context, requests } = createExecuteContext({
			respond: [
				{
					slack: { publications: true, comments: false },
					google_business: { publications: false, comments: true },
				},
			],
		});

		const items = await getSocialCapabilities.call(context, 0, newRunState());

		// The catalogue is the one thing that does not hang off an organization.
		expect(requests[0].url).toBe(`${BASE_URL}/social_capabilities`);
		expect(items).toEqual([
			{ social_network: 'slack', publications: true, comments: false },
			{ social_network: 'google_business', publications: false, comments: true },
		]);
	});
});
