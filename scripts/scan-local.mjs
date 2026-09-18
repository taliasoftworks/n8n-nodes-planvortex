/**
 * Runs n8n's official community-package static analysis against this working copy.
 *
 * The published CLI (`npx @n8n/scan-community-package n8n-nodes-planvortex`) downloads the
 * tarball from npm and verifies its provenance attestation, so it cannot run before the package
 * exists on the registry. The lint gate underneath it — which is what actually decides whether
 * the code passes — is exported as `analyzePackage(dir)` and does run locally, against the same
 * file patterns the scanner uses on a source checkout.
 *
 * The file count is printed, and zero files is a failure: `analyzePackage` answers `passed: true`
 * when its glob matches nothing, which is the one way this check can go green while testing
 * nothing at all.
 */
import {
	analyzePackage,
	SOURCE_FILE_PATTERNS,
} from '@n8n/scan-community-package/scanner/scanner.mjs';
import { globSync } from 'glob';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = globSync(SOURCE_FILE_PATTERNS, {
	cwd: packageDir,
	ignore: ['node_modules/**', '**/package-lock.json'],
});

if (files.length === 0) {
	console.error(`FAILED: the scanner matched no files in ${packageDir}`);
	process.exit(1);
}

const result = await analyzePackage(packageDir, SOURCE_FILE_PATTERNS);

if (result.passed) {
	console.log(`OK: ${files.length} files passed the n8n community-package scan`);
	process.exit(0);
}

console.error(`FAILED: ${result.message}`);
if (result.details) console.error(result.details);
process.exit(1);
