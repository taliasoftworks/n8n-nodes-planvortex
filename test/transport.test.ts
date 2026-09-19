import type { IDataObject, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { PlanVortexOAuth2Api } from '../credentials/PlanVortexOAuth2Api.credentials';
import {
	planVortexApiRequest,
	planVortexApiRequestAllItems,
	PLANVORTEX_CREDENTIALS,
} from '../nodes/PlanVortex/transport';
import { apiFailure, BASE_URL, createExecuteContext, TEST_NODE } from './helpers/context';

/**
 * The one door to the API, tested at the door.
 *
 * Everything below is about the request that gets built and the error that comes back, because
 * those are the two decisions the transport makes on behalf of all seven operations. Getting one
 * of them wrong is not a visible failure — it is an unfiltered inbox answered with a 200, or a
 * panel showing "Bad request" where PlanVortex sent a sentence explaining what to do.
 */

/** A page as the API answers one: the array under its own key, plus how many matched in total. */
function page(collection: string, items: IDataObject[], total: number): IDataObject {
	return { [collection]: items, total };
}

describe('planVortexApiRequest', () => {
	it('builds the URL from the credential and asks with the credential the node declares', async () => {
		const { context, requests, credentialNames } = createExecuteContext({ respond: [{}] });

		await planVortexApiRequest.call(context, 'GET', '/organizations/1/accounts');

		expect(requests[0].url).toBe(`${BASE_URL}/organizations/1/accounts`);
		expect(requests[0].method).toBe('GET');
		// The name is what n8n looks the saved credential up by: the two have to agree, and they
		// are written in two files.
		expect(credentialNames[0]).toBe(PLANVORTEX_CREDENTIALS);
		expect(new PlanVortexOAuth2Api().name).toBe(PLANVORTEX_CREDENTIALS);
	});

	it('tolerates a base URL somebody typed with a trailing slash', async () => {
		const { context, requests } = createExecuteContext({
			credentials: { baseUrl: `${BASE_URL}///` },
			respond: [{}],
		});

		await planVortexApiRequest.call(context, 'GET', '/social_networks');

		expect(requests[0].url).toBe(`${BASE_URL}/social_networks`);
	});

	it('falls back to the production API when the credential carries no base URL', async () => {
		const { context, requests } = createExecuteContext({ credentials: {}, respond: [{}] });

		await planVortexApiRequest.call(context, 'GET', '/social_networks');

		expect(requests[0].url).toBe('https://api.planvortex.com/v1.0.0/social_networks');
	});

	/**
	 * The convention that fails silently. The comments listing parses repeated parameters only,
	 * so `social_network[0]=discord` comes back as an inbox with no filter applied at all — a
	 * wrong answer with a 200 on it, which is the kind that gets believed.
	 */
	it('sends repeated query parameters rather than indexed ones', async () => {
		const { context, requests } = createExecuteContext({ respond: [{}] });

		await planVortexApiRequest.call(context, 'GET', '/x', undefined, {
			social_network: ['discord', 'telegram'],
		});

		expect(requests[0].arrayFormat).toBe('repeat');
		expect(requests[0].qs).toEqual({ social_network: ['discord', 'telegram'] });
	});

	it('leaves an empty body and an empty query string out of the request', async () => {
		const { context, requests } = createExecuteContext({ respond: [{}, {}] });

		await planVortexApiRequest.call(context, 'GET', '/x', {}, {});
		await planVortexApiRequest.call(context, 'POST', '/y', { text: 'hello' });

		expect(requests[0]).not.toHaveProperty('body');
		expect(requests[0]).not.toHaveProperty('qs');
		expect(requests[1].body).toEqual({ text: 'hello' });
	});

	it('lets an override replace anything but the Accept header', async () => {
		const { context, requests } = createExecuteContext({ respond: [{}] });
		const form = new FormData();

		await planVortexApiRequest.call(context, 'POST', '/x', undefined, undefined, {
			body: form,
			json: false,
			headers: { 'X-Test': '1' },
		});

		expect(requests[0].json).toBe(false);
		expect(requests[0].body).toBe(form);
		expect(requests[0].headers).toEqual({ Accept: 'application/json', 'X-Test': '1' });
	});

	it('parses a JSON answer that arrived as a string', async () => {
		// What `json: false` costs: the flag that serializes the request is the same one that
		// parses the response, so the upload's answer comes back as text.
		const { context } = createExecuteContext({ respond: ['{"upload":{"_id":"abc"}}'] });

		const response = await planVortexApiRequest.call(context, 'POST', '/uploads');

		expect(response).toEqual({ upload: { _id: 'abc' } });
	});

	it('hands back a string that is not JSON exactly as it arrived', async () => {
		const { context } = createExecuteContext({ respond: ['ok', '{not json}'] });

		expect(await planVortexApiRequest.call(context, 'GET', '/x')).toBe('ok');
		// Broken JSON is more use to whoever reads the failure than an exception about a shape
		// we never promised to parse.
		expect(await planVortexApiRequest.call(context, 'GET', '/y')).toBe('{not json}');
	});
});

describe('the error a failed request throws', () => {
	it("keeps PlanVortex's own message and adds what to do about it", async () => {
		const { context } = createExecuteContext({
			respond: () => {
				throw apiFailure(400, {
					code: 516,
					message: 'The comment inbox needs a paid plan',
					data: {},
				});
			},
		});

		const error = await planVortexApiRequest
			.call(context, 'GET', '/organizations/1/comments')
			.catch((thrown: NodeApiError) => thrown);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('The comment inbox needs a paid plan');
		expect((error as NodeApiError).description).toContain('free plan');
		expect((error as NodeApiError).description).toContain('(PlanVortex error 516)');
	});

	/**
	 * `code` is one of the keys n8n scans for an HTTP status and PlanVortex answers a numbered
	 * `code` in the body, so a 516 would be read as an HTTP status and rendered with n8n's own
	 * sentence for it. The real status is read off the response and passed in, which outranks it.
	 */
	it('takes the HTTP status from the response and not from the numbered code in the body', async () => {
		const { context } = createExecuteContext({
			respond: () => {
				throw apiFailure(400, { code: 516, message: 'Paid plan needed' });
			},
		});

		const error = (await planVortexApiRequest
			.call(context, 'GET', '/x')
			.catch((thrown: NodeApiError) => thrown)) as NodeApiError;

		expect(error.httpCode).toBe('400');
	});

	it('leaves a failure that is not the API alone', async () => {
		const timeout = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
		const { context } = createExecuteContext({
			respond: () => {
				throw timeout;
			},
		});

		const error = await planVortexApiRequest
			.call(context, 'GET', '/x')
			.catch((thrown: Error) => thrown);

		// n8n describes a timeout, a DNS failure or a proxy better than we could, and the body
		// this file knows how to read is not there.
		expect(error).toBe(timeout);
	});

	/**
	 * The n8n behaviour the whole design rests on, pinned here because it is invisible: the
	 * community-node reflex of re-wrapping a caught error with a nicer message is a no-op. The
	 * constructor hands back the instance it was given and silently drops the message — and the
	 * condition is always met, because `httpRequestWithAuthentication` has already wrapped the
	 * failure. That is why the transport builds its error from the API's body instead.
	 */
	it('cannot be improved by re-wrapping, which is why the body is used', () => {
		const original = apiFailure(400, { code: 516, message: 'Paid plan needed' });

		const rewrapped = new NodeApiError(TEST_NODE, original as unknown as JsonObject, {
			message: 'A much better message',
		});

		expect(rewrapped).toBe(original);
		expect(rewrapped.message).not.toBe('A much better message');
	});
});

describe('planVortexApiRequestAllItems', () => {
	it('walks the pages with offset and limit until it has them all', async () => {
		const { context, requests } = createExecuteContext({
			respond: [
				page('accounts', [{ _id: '1' }, { _id: '2' }], 3),
				page('accounts', [{ _id: '3' }], 3),
			],
		});

		const items = await planVortexApiRequestAllItems.call(
			context,
			'/organizations/1/accounts',
			'accounts',
		);

		expect(items.map((item) => item._id)).toEqual(['1', '2', '3']);
		expect(requests.map((request: IHttpRequestOptions) => request.qs)).toEqual([
			{ offset: 0, limit: 100 },
			{ offset: 2, limit: 100 },
		]);
	});

	it('keeps the caller filters on every page', async () => {
		const { context, requests } = createExecuteContext({
			respond: [page('comments', [{ _id: '1' }], 1)],
		});

		await planVortexApiRequestAllItems.call(context, '/x', 'comments', { unread: true });

		expect(requests[0].qs).toEqual({ unread: true, offset: 0, limit: 100 });
	});

	/**
	 * `total` counts what matched, which is not always what comes back: a filter applied after
	 * the count leaves the two disagreeing forever. The difference between a slow node and an
	 * endless one is the empty page stopping the loop.
	 */
	it('stops on an empty page even when the total says there is more', async () => {
		const { context, requests } = createExecuteContext({
			respond: [page('accounts', [{ _id: '1' }], 900), page('accounts', [], 900)],
		});

		const items = await planVortexApiRequestAllItems.call(context, '/x', 'accounts');

		expect(items).toHaveLength(1);
		expect(requests).toHaveLength(2);
	});

	it('stops at the limit it was given, and asks for no more than it needs', async () => {
		const { context, requests } = createExecuteContext({
			respond: [page('accounts', [{ _id: '1' }, { _id: '2' }], 50)],
		});

		const items = await planVortexApiRequestAllItems.call(context, '/x', 'accounts', {}, 2);

		expect(items).toHaveLength(2);
		expect(requests).toHaveLength(1);
		expect(requests[0].qs).toMatchObject({ limit: 2 });
	});

	it('never returns more than the limit, whatever the API decided to send', async () => {
		const { context } = createExecuteContext({
			respond: [page('accounts', [{ _id: '1' }, { _id: '2' }, { _id: '3' }], 3)],
		});

		const items = await planVortexApiRequestAllItems.call(context, '/x', 'accounts', {}, 2);

		expect(items.map((item) => item._id)).toEqual(['1', '2']);
	});

	it('treats a response with no collection in it as the end', async () => {
		const { context } = createExecuteContext({ respond: [{ total: 10 }] });

		expect(await planVortexApiRequestAllItems.call(context, '/x', 'accounts')).toEqual([]);
	});
});
