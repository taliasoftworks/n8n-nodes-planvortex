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

/** The body every PlanVortex error answers with: `{code, message, data}`. */
interface PlanVortexErrorBody {
	code: number;
	message?: string;
	data?: IDataObject;
}

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
 * The wording is still the server's own. Phase 4 of the roadmap replaces it with the generated
 * catalogue — `code` is the key it will look the message up by, and this is the only place that
 * has to change.
 */
function toPlanVortexError(node: INode, error: unknown): Error {
	const { body, httpCode } = readApiFailure(error);

	if (body === undefined) {
		// Not a PlanVortex error body: a timeout, a DNS failure, a proxy. n8n describes those
		// better than we could.
		return error as Error;
	}

	return new NodeApiError(node, body as unknown as JsonObject, {
		message: body.message ?? `PlanVortex request failed with code ${body.code}`,
		description: `PlanVortex error code ${body.code}`,
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
		...(body !== undefined && Object.keys(body).length > 0 ? { body } : {}),
		...(qs !== undefined && Object.keys(qs).length > 0 ? { qs } : {}),
		...overrides,
		headers: { Accept: 'application/json', ...overrides.headers },
	};

	try {
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			PLANVORTEX_CREDENTIALS,
			options,
		);
	} catch (error) {
		throw toPlanVortexError(this.getNode(), error);
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
