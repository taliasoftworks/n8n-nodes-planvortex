import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { describeApiError, type PlanVortexErrorBody } from './errors';

/**
 * The one door to the PlanVortex API.
 *
 * Nothing else in this package calls `this.helpers.httpRequest` — the same rule the server keeps
 * for Slack, Discord and Telegram, and for the same reason: the base URL, the credential, the
 * paging convention and the shape of an error are four decisions that have to be made once. A
 * second caller is a second set of answers, and they drift.
 *
 * The credential is not read for a token. n8n's generic `oAuth2Api` obtains it, stores it and
 * renews it on a 401; `httpRequestWithAuthentication` is what pulls it in. This file only needs
 * the credential for the base URL.
 */

/** Must match `PlanVortexOAuth2Api.name`. */
export const PLANVORTEX_CREDENTIALS = 'planVortexOAuth2Api';

/** Only reached if the credential predates the Base URL field, which no released version does. */
const DEFAULT_BASE_URL = 'https://api.planvortex.com/v1.0.0';

/** What a paged list endpoint is asked for per round trip. */
const PAGE_SIZE = 100;

export type PlanVortexContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function resolveBaseUrl(context: PlanVortexContext): Promise<string> {
	const credentials = await context.getCredentials(PLANVORTEX_CREDENTIALS);
	const configured = credentials.baseUrl;
	const baseUrl =
		typeof configured === 'string' && configured.trim() !== ''
			? configured.trim()
			: DEFAULT_BASE_URL;
	return baseUrl.replace(/\/+$/, '');
}

/**
 * Digs the API's own error body and HTTP status out of whatever n8n hands back.
 *
 * `httpRequestWithAuthentication` has already wrapped the failure in a `NodeApiError` by the time
 * it gets here, and the original axios error survives as its `cause`. That is where both the body
 * and the real HTTP status are read from, and the status is read there on purpose: `code` is one
 * of the keys n8n scans for an HTTP status, and PlanVortex answers a numbered `code` in the body
 * (516, 706, 960...). A real `response.status` outranks it, so the collision only shows up on the
 * fallback path below — which is exactly the path that would be hardest to notice going wrong.
 */
function readApiFailure(error: unknown): { body?: PlanVortexErrorBody; httpCode?: string } {
	const cause = (error as { cause?: unknown }).cause;
	const response = isObject(cause) ? (cause as { response?: unknown }).response : undefined;

	const data = isObject(response) ? (response as { data?: unknown }).data : undefined;
	const status = isObject(response) ? (response as { status?: unknown }).status : undefined;

	const payload = isObject(data)
		? data
		: // The NodeApiError copies `response.data` here when it recognises the shape, which is
			// the fallback for the day n8n stops forwarding the cause.
			isObject((error as { context?: IDataObject }).context?.data)
			? ((error as { context: IDataObject }).context.data as IDataObject)
			: undefined;

	const body =
		payload !== undefined && typeof payload.code === 'number'
			? (payload as unknown as PlanVortexErrorBody)
			: undefined;

	return {
		body,
		httpCode: typeof status === 'number' ? String(status) : undefined,
	};
}

/**
 * Turns an API failure into the error n8n shows in the panel.
 *
 * Note what this does NOT do: re-wrap. `new NodeApiError(node, anExistingNodeApiError)` returns
 * that same instance untouched, so the usual community-node reflex of wrapping the caught error
 * with a nicer message silently discards the message. The original body is passed instead.
 *
 * The headline stays the API's own sentence and the subtitle says what to do about it; both come
 * from `describeApiError`, which is the only place that decides either.
 */
function toPlanVortexError(node: INode, error: unknown): Error {
	const { body, httpCode } = readApiFailure(error);

	if (body === undefined) {
		// Not a PlanVortex error body: a timeout, a DNS failure, a proxy. n8n describes those
		// better than we could.
		return error as Error;
	}

	return new NodeApiError(node, body as unknown as JsonObject, {
		...describeApiError(body),
		httpCode,
	});
}

/**
 * One authenticated call against the API.
 *
 * `overrides` is the escape hatch for the requests that are not JSON — the media upload is
 * `multipart/form-data` — and it is applied last so it can replace anything here except the
 * `Accept` header, which is merged.
 */
export async function planVortexApiRequest(
	this: PlanVortexContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	overrides: Partial<IHttpRequestOptions> = {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const baseUrl = await resolveBaseUrl(this);

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
		// A repeated parameter, `?social_network=youtube&social_network=instagram`, is what the
		// API reads. It is stated rather than left to the default because the two conventions
		// fail differently: the comments listing parses only repeats, so `social_network[0]=...`
		// comes back as an unfiltered inbox — a wrong answer with a 200 on it, which is the kind
		// that gets believed. The accounts listing happens to accept a comma-separated string as
		// well, and that difference is exactly why this is decided once, here.
		arrayFormat: 'repeat',
		...(body !== undefined && Object.keys(body).length > 0 ? { body } : {}),
		...(qs !== undefined && Object.keys(qs).length > 0 ? { qs } : {}),
		...overrides,
		headers: { Accept: 'application/json', ...overrides.headers },
	};

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(
			this,
			PLANVORTEX_CREDENTIALS,
			options,
		);
		return parseJsonResponse(response);
	} catch (error) {
		throw toPlanVortexError(this.getNode(), error);
	}
}

/**
 * The API answers JSON on every route, and n8n normally hands it back parsed. The media upload is
 * the exception that makes this worth a function: it has to travel with `json: false`, because its
 * body is a `FormData` and the flag that says "serialize this as JSON" is the same flag that says
 * "parse the answer as JSON". Whether the helper still parses a JSON response body in that case is
 * its business, not ours, and the failure would be a `[object Object]` where an upload id belongs.
 */
function parseJsonResponse(response: unknown): unknown {
	if (typeof response !== 'string') return response;
	const trimmed = response.trim();
	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return response;
	try {
		return JSON.parse(trimmed);
	} catch {
		// Not JSON after all. Handing back the string is more use to whoever has to read the
		// failure than an exception about the shape of something we never promised to parse.
		return response;
	}
}

/**
 * Walks a paged list endpoint to the end.
 *
 * Every list in the API pages the same way — `offset` and `limit` in the query string, and a
 * response of `{<collection>: [...], total}` — so this knows the convention and the callers do
 * not. `collection` is the key the array sits under (`accounts`, `comments`, `clients`).
 *
 * An empty page stops the loop even when `total` says otherwise. `total` counts what matched,
 * which is not always what comes back — a filter applied after the count would leave the two
 * disagreeing forever, and the difference between a slow node and an endless one is this line.
 */
export async function planVortexApiRequestAllItems(
	this: PlanVortexContext,
	endpoint: string,
	collection: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let offset = 0;

	for (;;) {
		const pageSize = limit === undefined ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - items.length);
		const response = await planVortexApiRequest.call(this, 'GET', endpoint, undefined, {
			...qs,
			offset,
			limit: pageSize,
		});

		const page = isObject(response) && Array.isArray(response[collection])
			? (response[collection] as IDataObject[])
			: [];
		items.push(...page);

		if (page.length === 0) break;
		if (limit !== undefined && items.length >= limit) break;

		const total = isObject(response) && typeof response.total === 'number' ? response.total : 0;
		if (items.length >= total) break;

		offset += page.length;
	}

	return limit === undefined ? items : items.slice(0, limit);
}
