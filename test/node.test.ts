import type { IExecuteFunctions, IHttpRequestOptions, INodeExecutionData } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { PlanVortex } from '../nodes/PlanVortex/PlanVortex.node';
import { apiFailure, createExecuteContext } from './helpers/context';

/**
 * The node itself, which is a router and two rules.
 *
 * The rules are the ones that decide what a failing workflow looks like: every output item
 * carries the input item it came from, and one bad account does not take the other fourteen down
 * with it.
 */

const ORGANIZATION = '507f1f77bcf86cd799439011';

const node = new PlanVortex();

async function run(context: IExecuteFunctions): Promise<INodeExecutionData[]> {
	const [output] = await node.execute.call(context);
	return output;
}

describe('execute', () => {
	it('routes a resource and an operation to the right request', async () => {
		const { context, requests } = createExecuteContext({
			parameters: {
				resource: 'comment',
				operation: 'getAll',
				organizationId: ORGANIZATION,
				limit: 2,
			},
			respond: [{ comments: [{ _id: 'c1' }, { _id: 'c2' }], total: 2 }],
		});

		const output = await run(context);

		expect(requests.map((request: IHttpRequestOptions) => request.url)).toEqual([
			`https://api.planvortex.test/v1.0.0/organizations/${ORGANIZATION}/comments`,
		]);
		expect(output.map((item) => item.json)).toEqual([{ _id: 'c1' }, { _id: 'c2' }]);
	});

	/**
	 * A listing is many items in n8n, and every one of them has to say which input item it came
	 * from or the nodes downstream cannot trace anything back. `execute` is the single place that
	 * attaches it, so an operation cannot forget to.
	 */
	it('says which input item every output item came from', async () => {
		const { context } = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			parameters: {
				resource: 'comment',
				operation: 'getAll',
				organizationId: ORGANIZATION,
				limit: 1,
			},
			respond: [
				{ comments: [{ _id: 'c1' }], total: 1 },
				{ comments: [{ _id: 'c2' }], total: 1 },
			],
		});

		const output = await run(context);

		expect(output.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	/**
	 * What "Continue on Fail" has to mean here: a workflow publishing to fifteen accounts should
	 * not lose fourteen of them because one is disconnected.
	 */
	it('carries on past a failed item when the workflow asked it to', async () => {
		let call = 0;
		const { context } = createExecuteContext({
			items: [{ json: {} }, { json: {} }],
			parameters: {
				resource: 'comment',
				operation: 'getAll',
				organizationId: ORGANIZATION,
				limit: 1,
			},
			continueOnFail: true,
			respond: () => {
				call += 1;
				if (call === 1) throw apiFailure(400, { code: 516, message: 'Paid plan needed' });
				return { comments: [{ _id: 'c2' }], total: 1 };
			},
		});

		const output = await run(context);

		expect(output).toHaveLength(2);
		expect(output[0].json).toEqual({ error: 'Paid plan needed' });
		expect(output[0].pairedItem).toEqual({ item: 0 });
		expect(output[1].json).toEqual({ _id: 'c2' });
	});

	/**
	 * The other half of the re-wrapping trap. The transport has already built the error that says
	 * what happened and what to do about it; passing it through a `new NodeApiError` here would
	 * hand back the same instance and drop whatever message was written — so it is rethrown as it
	 * is, and this test is what notices if somebody "improves" that.
	 */
	it('rethrows the error the transport built, without touching it', async () => {
		const { context } = createExecuteContext({
			parameters: {
				resource: 'comment',
				operation: 'getAll',
				organizationId: ORGANIZATION,
				limit: 1,
			},
			respond: () => {
				throw apiFailure(400, { code: 516, message: 'Paid plan needed' });
			},
		});

		const error = (await run(context).catch((thrown: Error) => thrown)) as NodeApiError;

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.message).toBe('Paid plan needed');
		expect(error.description).toContain('(PlanVortex error 516)');
	});

	it('refuses an operation that does not exist on that resource', async () => {
		const { context } = createExecuteContext({
			parameters: { resource: 'account', operation: 'delete', organizationId: ORGANIZATION },
		});

		const error = (await run(context).catch((thrown: Error) => thrown)) as NodeOperationError;

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toContain('delete');
	});
});

describe('the node description', () => {
	/**
	 * Both halves of this are load-bearing and neither is visible: the credential name is what
	 * n8n looks a saved credential up by, and a node that is not `usableAsTool` cannot be handed
	 * to an AI Agent — which is half of what n8n is used for now.
	 */
	it('declares the credential it needs, and can be used as a tool', () => {
		expect(node.description.credentials).toEqual([{ name: 'planVortexOAuth2Api', required: true }]);
		expect(node.description.usableAsTool).toBe(true);
	});

	/**
	 * An operation offered in the panel with nothing behind it fails with "not supported" at run
	 * time — after somebody built a workflow on it. Rather than compare the panel against a copy
	 * of the routing table written here, which would be comparing this file with itself, each
	 * declared operation is actually executed: whatever else it does, it must not come back
	 * unrouted.
	 */
	it('has an implementation behind every operation it offers', async () => {
		const declared = declaredOperations();
		expect(declared).toHaveLength(7);

		for (const { resource, operation } of declared) {
			const { context } = createExecuteContext({
				parameters: { resource, operation, organizationId: ORGANIZATION, commentId: 'c1' },
				binary: { data: { fileName: 'f.png', mimeType: 'image/png' }, buffer: Buffer.from('x') },
				respond: () => ({}),
			});

			const error = (await run(context).catch((thrown: Error) => thrown)) as Error | undefined;
			expect(`${resource}:${operation} -> ${error?.message ?? 'ok'}`).not.toContain(
				'is not supported',
			);
		}
	});
});

/** Every operation the panel offers, read out of the node's own description. */
function declaredOperations(): Array<{ resource: string; operation: string }> {
	const declared: Array<{ resource: string; operation: string }> = [];

	for (const property of node.description.properties) {
		if (property.name !== 'operation') continue;
		const resource = String(property.displayOptions?.show?.resource?.[0]);
		for (const option of property.options ?? []) {
			declared.push({ resource, operation: (option as { value: string }).value });
		}
	}

	return declared;
}
