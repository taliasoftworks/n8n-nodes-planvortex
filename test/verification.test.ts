import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { PlanVortexOAuth2Api } from '../credentials/PlanVortexOAuth2Api.credentials';
import { PlanVortex } from '../nodes/PlanVortex/PlanVortex.node';
import publishWorkflow from '../.github/workflows/publish.yml?raw';

/**
 * What n8n's Creator Portal checks about the manifest, checked here first.
 *
 * The goal of this package is not to be on npm, it is to pass that review — a community node
 * that is not verified cannot be installed on n8n Cloud at all. Every rule below is one of the
 * published verification guidelines, and all of them share a failure mode: nothing breaks, the
 * package builds, the tests pass, and the rejection arrives weeks later with one sentence.
 *
 * The runtime-dependency rule, which is the one that shapes the whole package, has its own file.
 */

const manifest = packageJson as Record<string, unknown>;

describe('the package manifest', () => {
	it('is named the way n8n requires and keeps that name forever', () => {
		// `n8n-nodes-*` or `@scope/n8n-nodes-*`. The name is also what a user types to install it,
		// and npm does not let a published name be reused.
		expect(packageJson.name).toMatch(/^(@[\w-]+\/)?n8n-nodes-[\w-]+$/);
		expect(packageJson.name).toBe('n8n-nodes-planvortex');
	});

	/** How n8n finds community packages at all. Without it the package is invisible to the scan. */
	it('carries the keyword the registry is searched by', () => {
		expect(packageJson.keywords).toContain('n8n-community-node-package');
	});

	it('is MIT, which is a requirement and not a preference', () => {
		expect(packageJson.license).toBe('MIT');
	});

	it('declares the node and the credential where n8n looks for them', () => {
		expect(packageJson.n8n.n8nNodesApiVersion).toBe(1);
		expect(packageJson.n8n.nodes).toEqual(['dist/nodes/PlanVortex/PlanVortex.node.js']);
		expect(packageJson.n8n.credentials).toEqual([
			'dist/credentials/PlanVortexOAuth2Api.credentials.js',
		]);
	});

	/**
	 * The manifest points at built files by path, and a class renamed in the source leaves those
	 * paths pointing at nothing — a package that installs and then has no nodes in it. Tying each
	 * path to the class it must contain is what makes a rename fail here instead of there.
	 */
	it('points at files the classes actually compile into', () => {
		expect(packageJson.n8n.nodes[0]).toContain(`/${PlanVortex.name}.node.js`);
		expect(packageJson.n8n.credentials[0]).toContain(
			`/${PlanVortexOAuth2Api.name}.credentials.js`,
		);
	});

	it('publishes the built output and nothing else', () => {
		expect(packageJson.files).toEqual(['dist']);
	});

	/**
	 * The oldest Node any n8n still in use runs on: 1.x and early 2.x ask for 20.19+, and current
	 * 2.x for 24. The package itself imposes nothing — no dependencies, no Node API — so it follows
	 * the oldest. (The CI matrix starts at 22 for a dev-toolchain reason explained in `ci.yml`.)
	 */
	it('asks for the Node versions n8n runs on', () => {
		expect(packageJson.engines.node).toBe('>=20');
	});

	/**
	 * Verification reads the repository and the issue tracker, and a review that cannot find the
	 * source is a review that stops there.
	 */
	it('says where the source and the issues live', () => {
		expect(packageJson.repository.url).toContain('github.com/taliasoftworks/n8n-nodes-planvortex');
		expect(packageJson.bugs.url).toContain('github.com/taliasoftworks/n8n-nodes-planvortex');
	});

	/**
	 * Publishing from a laptop has not been accepted since 01-05-2026: a community node has to be
	 * published by GitHub Actions with an npm provenance statement. The release path is the
	 * scaffold's, and `prepublishOnly` is what refuses a hand-made `npm publish`.
	 */
	it('keeps the release path n8n requires', () => {
		const scripts = manifest.scripts as Record<string, string>;
		expect(scripts.release).toContain('n8n-node release');
		expect(scripts.prepublishOnly).toContain('n8n-node prerelease');
	});

	/**
	 * The error catalogue is generated from a committed snapshot, and the generator runs before
	 * every build so the generated file can never be stale against it. If that hook goes, the two
	 * drift apart in silence — which is the exact failure the generation was introduced to stop.
	 */
	it('regenerates the error catalogue before every build', () => {
		const scripts = manifest.scripts as Record<string, string>;
		expect(scripts.prebuild).toContain('errors:generate');
	});
});

/**
 * The workflow that publishes the package, read as text. Since 01-05-2026 n8n only verifies a
 * node published from GitHub Actions with a provenance statement, and every way this file can be
 * half-copied fails somewhere nobody is looking: a run that stays green having published nothing,
 * or an `E404` that reads like a missing package and means a missing credential.
 *
 * It is imported with `?raw` for the same reason `package.json` is imported: `node:fs` is out of
 * bounds in this repository, tests included.
 */
describe('the publish workflow', () => {
	it('publishes from Actions with provenance, and may mint the token that signs it', () => {
		expect(publishWorkflow).toContain('id-token: write');
		expect(publishWorkflow).toContain('npm publish --provenance');
	});

	/**
	 * Trusted publishing needs npm 11.5.1 and Node 22 ships npm 10. Without the upgrade npm still
	 * signs the provenance, skips the exchange that would have authenticated it, and fails the
	 * upload with an `E404`.
	 */
	it('upgrades npm before publishing', () => {
		expect(publishWorkflow).toContain('npm install -g npm@latest');
	});

	/**
	 * `npm run release` (the scaffold's release-it) creates and pushes the tag; this workflow only
	 * runs on tags matching its trigger. If the two disagree, a release is tagged, pushed, and
	 * nothing ever runs — no red run, no publish, nothing at all.
	 */
	it('listens to the tag the release tooling creates', () => {
		const trigger = /tags:\s*\[\s*'([^']+)'\s*\]/.exec(publishWorkflow)?.[1];
		expect(trigger).toBeDefined();

		// GitHub's filter syntax: `*` is any run of characters other than `/`.
		const glob = trigger!.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
		const pattern = new RegExp(`^${glob}$`);
		const releaseIt = manifest['release-it'] as { git: { tagName: string } };
		const tag = releaseIt.git.tagName.replace('${version}', packageJson.version);

		expect(tag).toMatch(pattern);
	});

	/**
	 * `npx @n8n/scan-community-package` prints a failure and exits 0, so a step built on it is
	 * green whatever it finds. The script turns the verdict into an exit code.
	 */
	it('scans what it published with a check that can fail the run', () => {
		expect(publishWorkflow).toContain('npm run scan:published');
		expect(publishWorkflow).not.toMatch(/npx\s+@n8n\/scan-community-package/);
	});
});
