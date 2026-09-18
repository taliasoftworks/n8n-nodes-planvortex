import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { planVortexApiRequest } from '../transport';

/**
 * What every operation is handed, and what it gives back.
 *
 * An operation returns plain objects, not `INodeExecutionData`: the node's `execute` is the one
 * place that attaches `pairedItem`, so an operation cannot forget to. Several of them return more
 * than one object — a listing is many items in n8n, never one object with an array inside it.
 */
export type OperationHandler = (
	this: IExecuteFunctions,
	index: number,
	run: RunState,
) => Promise<IDataObject[]>;

/**
 * What one execution of the node remembers while it walks its items.
 *
 * It exists for a single thing, and it is not an optimisation for its own sake: publishing has to
 * know the account's network, and a workflow that posts fifty items to the same account would ask
 * the API fifty times for the same answer. It is created fresh in `execute`, never at module
 * scope: state that outlives one run is state that goes stale between them.
 */
export interface RunState {
	accounts: Map<string, IDataObject>;
}

export function newRunState(): RunState {
	return { accounts: new Map() };
}

/**
 * The organization every operation but the catalogue hangs off.
 *
 * It is read here rather than in each operation so that an empty one is one error message instead
 * of six, and so that an id arriving from an expression is trimmed the same way everywhere.
 */
export function getOrganizationId(context: IExecuteFunctions, index: number): string {
	return getRequiredId(
		context,
		index,
		'organizationId',
		'organization',
		'Every PlanVortex resource belongs to an organization.',
	);
}

/**
 * An identifier that has to be there.
 *
 * Empty is worth catching here rather than sending: an id that is not an ObjectId comes back from
 * the API as a 503 about the organization, which points at the one thing that was not wrong.
 */
export function getRequiredId(
	context: IExecuteFunctions,
	index: number,
	parameter: string,
	label: string,
	why: string,
): string {
	const value = String(context.getNodeParameter(parameter, index, '') ?? '').trim();
	if (value === '') {
		throw new NodeOperationError(context.getNode(), `No ${label} was selected`, {
			description: `${why} Pick one from the list, or pass its id with an expression.`,
			itemIndex: index,
		});
	}
	return value;
}

/**
 * One connected account, read once per execution.
 *
 * Publishing needs it: `social_network` is a required field of the publication and the API answers
 * error 702 without it, so the node resolves it from the account rather than asking the workflow
 * author to type a network next to an account they already picked. Getting it wrong is not a
 * validation error either — it is a post on the wrong network.
 */
export async function getAccountOnce(
	context: IExecuteFunctions,
	index: number,
	organizationId: string,
	accountId: string,
	run: RunState,
): Promise<IDataObject> {
	const key = `${organizationId}:${accountId}`;
	const cached = run.accounts.get(key);
	if (cached !== undefined) return cached;

	const response = (await planVortexApiRequest.call(
		context,
		'GET',
		`/organizations/${organizationId}/accounts/${accountId}`,
	)) as { account?: IDataObject };

	const account = response?.account;
	if (account === undefined) {
		throw new NodeOperationError(context.getNode(), 'That account does not exist', {
			description: `No account with id ${accountId} belongs to organization ${organizationId}.`,
			itemIndex: index,
		});
	}

	run.accounts.set(key, account);
	return account;
}

/**
 * The upload ids of a publication, as a workflow can realistically supply them.
 *
 * n8n has no list-of-strings parameter, so several ids arrive as one string — usually built with
 * an expression over the output of the upload operation. Empty entries are dropped rather than
 * sent: an id of `''` reaches the API as an invalid ObjectId and comes back as a 503 about the
 * organization, which points at the wrong thing entirely.
 */
export function splitIds(value: string): string[] {
	return value
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id !== '');
}

/** A network's name as a person reads it: `google_business` is Google Business. */
export function networkLabel(network: string): string {
	return network
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
