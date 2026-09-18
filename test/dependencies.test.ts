import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

/**
 * n8n's verification guidelines are literal about this: "Ensure that your package does not
 * include any external dependencies". A node that ships one is rejected, and the rejection
 * arrives weeks after the commit that caused it.
 *
 * This is the rule that breaks by itself the day somebody adds "just one small utility", so it
 * gets a test rather than a line in a document.
 *
 * `package.json` is imported rather than read with `node:fs` on purpose: `n8n-node lint` applies
 * the cloud-compatibility rules to every file in the repository, and those rules forbid Node
 * built-ins and `__dirname`. Keeping the test inside them means nothing here can pass review by
 * being exempt from it.
 */
const manifest = packageJson as Record<string, unknown>;

describe('runtime dependencies', () => {
	it('has no dependencies', () => {
		expect(manifest.dependencies ?? {}).toEqual({});
	});

	it('has no optional dependencies', () => {
		expect(manifest.optionalDependencies ?? {}).toEqual({});
	});

	// Both spellings are valid npm and both ship code at runtime, so both are closed.
	it('bundles nothing', () => {
		expect(manifest.bundledDependencies ?? []).toEqual([]);
		expect(manifest.bundleDependencies ?? []).toEqual([]);
	});

	/**
	 * `n8n-workflow` is the only thing the node imports, and it is a peer dependency: n8n itself
	 * provides it at runtime, so it is never installed alongside the package.
	 */
	it('declares n8n-workflow as a peer dependency and nothing else', () => {
		expect(Object.keys(packageJson.peerDependencies)).toEqual(['n8n-workflow']);
	});
});
