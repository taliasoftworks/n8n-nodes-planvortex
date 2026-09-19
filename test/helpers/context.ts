import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * The n8n an operation thinks it is running inside.
 *
 * Everything in this package reaches the network through one function, so a fake that answers
 * `helpers.httpRequestWithAuthentication` is enough to drive every operation without a socket,
 * a credential or an n8n. That is the whole reason the transport is a single door: it is also a
 * single seam.
 *
 * What these fakes deliberately do NOT do is guess. Every request an operation makes is recorded
 * exactly as it was built, and the tests assert on it — a fake that normalised the options would
 * be testing itself.
 */

export const TEST_NODE: INode = {
	id: '11111111-1111-1111-1111-111111111111',
	name: 'PlanVortex',
	type: 'n8n-nodes-planvortex.planVortex',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export const BASE_URL = 'https://api.planvortex.test/v1.0.0';

/** What the fake answers one request with. Throwing from here is how a failure is simulated. */
export type Responder = (options: IHttpRequestOptions) => unknown;

export interface FakeContextOptions {
	/**
	 * The node's parameters. One object applies to every item; an array gives each item its own,
	 * which is what a multi-item execution looks like in a real workflow.
	 */
	parameters?: IDataObject | IDataObject[];
	/** `getCurrentNodeParameter`, which is all a dropdown can read. */
	currentParameters?: IDataObject;
	credentials?: IDataObject;
	/** The binary field of the incoming item, for the upload operation. */
	binary?: { data: Partial<IBinaryData>; buffer: Buffer };
	/** A function, or one answer per request in order. */
	respond?: Responder | unknown[];
	items?: INodeExecutionData[];
	continueOnFail?: boolean;
}

export interface FakeContext {
	/** Every request that was built, in the order the operation built it. */
	requests: IHttpRequestOptions[];
	/** The credential name each request was made with. */
	credentialNames: string[];
}

function makeResponder(respond: FakeContextOptions['respond']): Responder {
	if (typeof respond === 'function') return respond;

	const queue = [...(respond ?? [])];
	return () => {
		if (queue.length === 0) {
			throw new Error('The operation made more requests than the test queued answers for');
		}
		const next = queue.shift();
		if (next instanceof Error) throw next;
		return next;
	};
}

function makeBase(options: FakeContextOptions) {
	const state: FakeContext = { requests: [], credentialNames: [] };
	const responder = makeResponder(options.respond);
	const credentials = options.credentials ?? { baseUrl: BASE_URL };

	const parametersFor = (index: number): IDataObject =>
		Array.isArray(options.parameters)
			? (options.parameters[index] ?? {})
			: (options.parameters ?? {});

	const helpers = {
		async httpRequestWithAuthentication(
			this: unknown,
			credentialName: string,
			requestOptions: IHttpRequestOptions,
		) {
			state.credentialNames.push(credentialName);
			state.requests.push(requestOptions);
			return await responder(requestOptions);
		},
	};

	return { state, credentials, parametersFor, helpers };
}

/** The context an operation runs in. */
export function createExecuteContext(
	options: FakeContextOptions = {},
): { context: IExecuteFunctions } & FakeContext {
	const { state, credentials, parametersFor, helpers } = makeBase(options);

	const context = {
		getNode: () => TEST_NODE,
		getCredentials: async () => credentials,
		getInputData: () => options.items ?? [{ json: {} }],
		continueOnFail: () => options.continueOnFail === true,
		getNodeParameter(name: string, index: number, fallback?: unknown) {
			const value = parametersFor(index)[name];
			return value === undefined ? fallback : value;
		},
		helpers: {
			...helpers,
			assertBinaryData(_index: number, propertyName: string): IBinaryData {
				if (options.binary === undefined) {
					throw new Error(`The item has no binary field called "${propertyName}"`);
				}
				return { data: '', mimeType: 'application/octet-stream', ...options.binary.data };
			},
			async getBinaryDataBuffer(): Promise<Buffer> {
				if (options.binary === undefined) throw new Error('The item has no binary data');
				return options.binary.buffer;
			},
		},
	};

	return { context: context as unknown as IExecuteFunctions, ...state };
}

/** The context a dropdown runs in: no items, and only the parameters already filled in. */
export function createLoadOptionsContext(
	options: FakeContextOptions = {},
): { context: ILoadOptionsFunctions } & FakeContext {
	const { state, credentials, helpers } = makeBase(options);

	const context = {
		getNode: () => TEST_NODE,
		getCredentials: async () => credentials,
		getCurrentNodeParameter: (name: string) => (options.currentParameters ?? {})[name],
		helpers,
	};

	return { context: context as unknown as ILoadOptionsFunctions, ...state };
}

/**
 * The failure n8n hands a node when the API answers an error.
 *
 * This shape is the part worth imitating faithfully, because it is the part the transport digs
 * through: `httpRequestWithAuthentication` has already wrapped the axios error in a
 * `NodeApiError` by the time a node sees it, and the original survives as its `cause`. A fake
 * that threw the raw body instead would test a path that never happens in production.
 */
export function apiFailure(status: number, body: IDataObject): NodeApiError {
	const axiosError = Object.assign(new Error(`Request failed with status code ${status}`), {
		name: 'AxiosError',
		isAxiosError: true,
		response: { status, data: body },
	});

	return new NodeApiError(TEST_NODE, axiosError as unknown as JsonObject);
}
