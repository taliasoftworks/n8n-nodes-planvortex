import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';
import {
	getAccounts as loadAccountOptions,
	getCommentNetworks,
	getOrganizations,
	getPublishingAccounts,
	getSocialNetworks,
} from './methods/loadOptions';
import { organizationIdProperty } from './resources/common';
import { newRunState, type OperationHandler } from './resources/helpers';
import { accountFields, accountOperations } from './resources/account';
import { createConnectLink } from './resources/account/connectLink';
import { getAccounts } from './resources/account/getAll';
import { commentFields, commentOperations } from './resources/comment';
import { getComments } from './resources/comment/getAll';
import { replyToComment } from './resources/comment/reply';
import { mediaFields, mediaOperations } from './resources/media';
import { uploadMedia } from './resources/media/upload';
import { publicationFields, publicationOperations } from './resources/publication';
import { createPublication } from './resources/publication/create';
import { socialNetworkFields, socialNetworkOperations } from './resources/socialNetwork';
import { getSocialCapabilities } from './resources/socialNetwork/getCapabilities';

/**
 * Seven operations, and the reason this node is programmatic rather than declarative.
 *
 * The declarative style describes one HTTP call per operation and lets n8n make it. Three of these
 * seven do not fit in that sentence. The media upload has to read binary data off the item and
 * build a multipart body; creating a publication has to resolve the account's network first,
 * because the API requires it in the body and answers error 702 without it; and every failure has
 * to be turned into a message that names the PlanVortex error code rather than the HTTP status,
 * which only happens if the call goes through this package's transport.
 *
 * That last one is the real argument. Declarative routing goes to the network by itself, so half
 * the operations would translate errors and half would not — and the half that did not would be
 * the half nobody notices until a workflow fails at three in the morning.
 *
 * Whatever this node does not cover is one `HTTP Request` node away, against the same API and the
 * same credential.
 */
const OPERATIONS: Record<string, OperationHandler> = {
	'account:connectLink': createConnectLink,
	'account:getAll': getAccounts,
	'comment:getAll': getComments,
	'comment:reply': replyToComment,
	'media:upload': uploadMedia,
	'publication:create': createPublication,
	'socialNetwork:getCapabilities': getSocialCapabilities,
};

export class PlanVortex implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlanVortex',
		name: 'planVortex',
		icon: { light: 'file:planvortex.svg', dark: 'file:planvortex.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Publish to social networks, upload media and work the comment inbox',
		defaults: {
			name: 'PlanVortex',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'planVortexOAuth2Api', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Account',
						value: 'account',
					},
					{
						name: 'Comment',
						value: 'comment',
					},
					{
						name: 'Media',
						value: 'media',
					},
					{
						name: 'Publication',
						value: 'publication',
					},
					{
						name: 'Social Network',
						value: 'socialNetwork',
					},
				],
				default: 'publication',
			},
			...accountOperations,
			...commentOperations,
			...mediaOperations,
			...publicationOperations,
			...socialNetworkOperations,
			// Between the operation and its own fields on purpose: everything but the catalogue
			// belongs to an organization, and it is the first thing to pick because the account
			// and comment dropdowns are loaded from it.
			organizationIdProperty,
			...accountFields,
			...commentFields,
			...mediaFields,
			...publicationFields,
			...socialNetworkFields,
		],
	};

	methods = {
		loadOptions: {
			getAccounts: loadAccountOptions,
			getCommentNetworks,
			getOrganizations,
			getPublishingAccounts,
			getSocialNetworks,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		// One per execution, never at module scope: it remembers the accounts this run has already
		// looked up, and nothing that outlives the run.
		const run = newRunState();

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			const operation = this.getNodeParameter('operation', i) as string;

			try {
				const handler = OPERATIONS[`${resource}:${operation}`];
				if (handler === undefined) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported on "${resource}"`,
						{ itemIndex: i },
					);
				}

				const results = await handler.call(this, i, run);
				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				// A workflow publishing to fifteen accounts should not lose fourteen of them
				// because one is disconnected, which is what stopping here would do.
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Ours goes back untouched. The transport has already turned an API failure into a
				// NodeApiError carrying PlanVortex's own code and message, and re-wrapping one is
				// a no-op that loses it: NodeApiError's constructor hands back the instance it was
				// given and discards the message written here. Anything that is not already ours
				// arrived with no shape at all, and that one does get wrapped.
				throw error instanceof NodeApiError || error instanceof NodeOperationError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
